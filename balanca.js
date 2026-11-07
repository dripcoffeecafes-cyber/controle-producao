// Balança Timemore (Black Mirror Dot, TES017) por Bluetooth, direto do navegador (Web Bluetooth).
// Funciona no Chrome/Edge do computador e do Android, com HTTPS. No iPhone o navegador não tem Bluetooth.
//
// Protocolo (aberto, testado num aparelho real pelo projeto decentespresso/decaid):
//   serviço 0xFFF0; peso chega por notificação em 0xFFF1; comandos vão em 0xFFF2 (sem resposta).
//   Quadro: A5 5A | opcode | cmd | tamanho (2 bytes) | dados | CRC16/MODBUS (2 bytes, byte alto primeiro).
//   A Dot só manda peso depois de receber a unidade e o modo. Peso = int32 (big endian) ÷ 10, em gramas.
//   Os quadros que a balança manda não trazem CRC válido (vem 00 00): não conferir.

const SERVICO = 0xfff0, NOTIFICA = 0xfff1, COMANDO = 0xfff2;

export function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

export function quadro(opcode, cmd, dados = []) {
  const corpo = [0xa5, 0x5a, opcode, cmd, (dados.length >> 8) & 0xff, dados.length & 0xff, ...dados];
  const c = crc16(corpo);
  return new Uint8Array([...corpo, (c >> 8) & 0xff, c & 0xff]);
}

export const CMD = {
  tara: () => quadro(0x03, 0x0d),
  unidade: () => quadro(0x03, 0x06, [0x00]),     // gramas
  modo: () => quadro(0x03, 0x08, [0x01, 0x00]),
  bateria: () => quadro(0x02, 0x05),
};

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
const espera = ms => new Promise(r => setTimeout(r, ms));

// Separa os quadros que chegam (podem vir quebrados ou grudados) e devolve o que interessa.
export function criarLeitor() {
  let buf = [];
  return function ler(bytes) {
    buf.push(...bytes);
    if (buf.length > 256) buf = buf.slice(-256);
    const saida = [];
    while (buf.length >= 6) {
      if (buf[0] !== 0xa5 || buf[1] !== 0x5a) { buf.shift(); continue; }
      const n = (buf[4] << 8) | buf[5];
      if (n > 64) { buf.shift(); continue; }
      const total = n + 8;
      if (buf.length < total) break;
      const q = buf.slice(0, total); buf = buf.slice(total);
      const opcode = q[2], cmd = q[3], dados = q.slice(6, 6 + n);
      if (opcode === 0x03) { saida.push({ tipo: 'ok', cmd }); continue; }
      if (cmd === 0x01 && dados.length >= 4) {
        const v = new DataView(new Uint8Array(dados).buffer);
        saida.push({ tipo: 'peso', gramas: v.getInt32(0, false) / 10 });
      } else if (cmd === 0x05 && dados.length) {
        const b = dados.length >= 2 ? dados[1] : dados[0];
        if (b <= 100) saida.push({ tipo: 'bateria', nivel: b });
      }
    }
    return saida;
  };
}

export const temBluetooth = () => !!(navigator.bluetooth && window.isSecureContext);

// Balança de verdade.
// ev: { peso(g), bateria(n), estado('conectando'|'pareando'|'conectada'|'reconectando'|'desconectada', nome), bruto(texto) }
// opcoes: { esperaPareamento (ms, padrão 90 s) }
//
// Pareamento (descoberto no teste de 07/11 no Windows): a Dot só liga as notificações do peso com o link pareado.
// Quando o app liga as notificações, o Windows e/ou o Chrome começam a parear. Enquanto isso, ligar as notificações
// falha com "Connection already in progress." / "Authentication failed." / "GATT operation not authorized.".
// Desconectar no meio mata o pareamento: por isso, nesses erros o app MANTÉM a conexão e tenta de novo a cada 3 s
// até o pareamento terminar (a pessoa aceita o aviso do Windows ou a janela do Chrome) ou acabar o tempo.
export function criarBalanca(ev, opcoes = {}) {
  const ESPERA_PAREAMENTO = opcoes.esperaPareamento ?? 90000;
  let device = null, cmdChar = null, querConectada = false, abrindo = false, jaConectou = false, inicioLog = 0;
  const leitor = criarLeitor();

  async function escrever(bytes) {
    if (!cmdChar) return;
    ev.bruto?.('→ ' + hex(bytes));
    try {
      if (cmdChar.writeValueWithoutResponse) await cmdChar.writeValueWithoutResponse(bytes);
      else await cmdChar.writeValue(bytes);
    } catch (e) {
      try { await cmdChar.writeValue(bytes); } catch {}
    }
  }

  function aoNotificar(e) {
    const bytes = new Uint8Array(e.target.value.buffer);
    ev.bruto?.('← ' + hex(bytes));
    for (const m of leitor(bytes)) {
      if (m.tipo === 'peso') ev.peso?.(m.gramas);
      if (m.tipo === 'bateria') ev.bateria?.(m.nivel);
    }
  }

  const log = t => ev.bruto?.(`· [${((performance.now() - inicioLog) / 1000).toFixed(1).replace('.', ',')} s] ${t}`);
  const descreve = e => `${e?.name}: ${e?.message}`;
  const caiu = e => /disconnected|no longer|not connected/i.test(e?.message || '');

  // Tenta algumas vezes: no Windows a primeira conexão costuma falhar ("unknown reason")
  async function tentar(nome, fn, vezes = 3) {
    for (let i = 1; ; i++) {
      try { return await fn(); }
      catch (e) {
        log(`${nome} falhou (tentativa ${i}): ${descreve(e)}`);
        if (i >= vezes) throw e;
        await espera(600 * i);
      }
    }
  }

  // Conecta (ou aproveita a conexão que já está aberta), acha os canais e liga as notificações do peso
  async function abrir() {
    let server = device.gatt;
    if (!server.connected) {
      log(`conectando em "${device.name || 'sem nome'}"`);
      server = await tentar('conexão', () => device.gatt.connect());
      log('conectado; procurando o serviço FFF0');
    }
    let servico;
    try {
      servico = await tentar('serviço FFF0', () => server.getPrimaryService(SERVICO), 2);
    } catch (e) {
      try {
        const lista = await server.getPrimaryServices();
        log('serviços disponíveis: ' + (lista.map(x => x.uuid).join(', ') || 'nenhum'));
      } catch (e2) { log(`não deu para listar os serviços: ${descreve(e2)}`); }
      throw e;
    }
    const notif = await servico.getCharacteristic(NOTIFICA);
    cmdChar = await servico.getCharacteristic(COMANDO);
    notif.removeEventListener('characteristicvaluechanged', aoNotificar);
    notif.addEventListener('characteristicvaluechanged', aoNotificar);
    // se ligar as notificações demorar, é porque o Chrome/Windows está esperando a pessoa aceitar o pareamento
    const avisoDemora = setTimeout(() => {
      log('ligar as notificações está demorando: provavelmente esperando aceitar o pareamento');
      ev.estado?.('pareando');
    }, 2500);
    try {
      await notif.startNotifications();
    } catch (e) {
      e.etapa = 'notificacoes';
      throw e;
    } finally { clearTimeout(avisoDemora); }
    log('notificações ligadas; mandando unidade, modo e bateria');
    // sequência de início: sem ela a Dot não manda peso
    await espera(500); await escrever(CMD.unidade());
    await espera(200); await escrever(CMD.modo());
    await espera(100); await escrever(CMD.bateria());
    ev.estado?.('conectada', device.name || 'Timemore');
  }

  async function aoDesconectar() {
    cmdChar = null;
    log('a balança desconectou');
    // durante a conexão inicial quem tenta de novo é o conectar(); aqui só reconecta se já estava funcionando
    if (abrindo) return;
    if (!querConectada || !jaConectou) { ev.estado?.('desconectada'); return; }
    // caiu sozinha depois de funcionar: tenta voltar algumas vezes
    for (let i = 1; i <= 4 && querConectada; i++) {
      ev.estado?.('reconectando');
      await espera(800 * i);
      abrindo = true;
      try { await abrir(); return; } catch (e) { log(`reconectar falhou: ${descreve(e)}`); } finally { abrindo = false; }
    }
    querConectada = false;
    ev.estado?.('desconectada');
  }

  function erroFinal(e, pareando) {
    let nome = '';
    if (pareando || e.etapa === 'notificacoes' || e.name === 'SecurityError') {
      const m = e.message || '';
      nome = /authentication failed/i.test(m) ? 'PareamentoRecusadoError'
        : /rejected/i.test(m) ? 'PareamentoRejeitadoError'
        : /in progress/i.test(m) ? 'PareamentoPendenteError'
        : 'PareamentoError';
    }
    if (!nome) return e;
    const err = new Error(e.message);
    err.name = nome;
    return err;
  }

  return {
    tipo: 'bluetooth',
    async conectar() {
      if (!temBluetooth()) throw new Error('sem-bluetooth');
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SERVICO] },
          { namePrefix: 'TIMEMORE' }, { namePrefix: 'Timemore' }, { namePrefix: 'timemore' },
          { namePrefix: 'Dot' }, { namePrefix: 'DOT' }, { namePrefix: 'TES' },
        ],
        // outros serviços comuns, só para conseguir listar o que a balança tem se o FFF0 não aparecer
        optionalServices: [SERVICO, 0xffe0, 0xffb0, 0xfee7, 0x180f, 0x180a],
      });
      inicioLog = performance.now();
      log(`escolhida: "${device.name || 'sem nome'}"`);
      device.removeEventListener('gattserverdisconnected', aoDesconectar);
      device.addEventListener('gattserverdisconnected', aoDesconectar);
      querConectada = true; abrindo = true; jaConectou = false;
      ev.estado?.('conectando');
      let falhas = 0, pareando = false, limite = 0, ultimoErro = '', repetidos = 0, semJeito = 0;
      const cancelado = () => { abrindo = false; const err = new Error('cancelado'); err.name = 'CanceladoError'; return err; };
      while (true) {
        if (!querConectada) throw cancelado();
        try {
          await abrir();
          if (pareando) log('pareamento concluído');
          jaConectou = true; abrindo = false;
          return;
        } catch (e) {
          // no pareamento o mesmo erro se repete a cada 3 s: registra só quando muda (ou a cada 10)
          const txt = `erro: ${descreve(e)} (ligada: ${device.gatt.connected ? 'sim' : 'não'})`;
          if (txt === ultimoErro) { if (++repetidos % 10 === 0) log(`${txt} (repetido ${repetidos}x)`); }
          else { ultimoErro = txt; repetidos = 1; log(txt); }
          if (!querConectada) throw cancelado();
          // erro de pareamento: não desconectar; esperar o pareamento terminar e tentar de novo
          const ehPareamento = (e.etapa === 'notificacoes' && !caiu(e)) || e.name === 'SecurityError';
          if (ehPareamento && !pareando) {
            pareando = true;
            limite = performance.now() + ESPERA_PAREAMENTO;
            log(`a balança pediu pareamento; esperando até ${Math.round(ESPERA_PAREAMENTO / 1000)} s, sem desconectar`);
            ev.estado?.('pareando');
          }
          // "Authentication failed" = o Chrome recusou o tipo de pareamento (opção desligada);
          // "rejected" = a balança recusou (fora do modo de pareamento). Esperar não resolve: desiste na 2ª vez.
          if (pareando && /authentication failed|rejected/i.test(e.message || '')) semJeito++;
          if (pareando && semJeito < 2 && performance.now() < limite) { await espera(3000); continue; }
          if (repetidos > 1) log(`(o último erro se repetiu ${repetidos}x)`);
          // outros erros (conexão, serviço): até 3 rodadas, desconectando entre elas
          if (!pareando && ++falhas < 3) {
            try { device.gatt.disconnect(); } catch {}
            await espera(2000);
            continue;
          }
          abrindo = false; querConectada = false;
          try { device.gatt.disconnect(); } catch {}
          ev.estado?.('desconectada');
          throw erroFinal(e, pareando);
        }
      }
    },
    async desconectar() {
      querConectada = false;
      try { device?.gatt?.disconnect(); } catch {}
      ev.estado?.('desconectada');
    },
    tara: () => escrever(CMD.tara()),
    pedirBateria: () => escrever(CMD.bateria()),
  };
}

// Simulador: para testar a tela sem a balança. Sem receita, faz um coado de V60 (pré-infusão + 3 despejos);
// com despejarPerfil(perfil), segue a curva-alvo da receita (com um pouco de atraso e de variação, como uma pessoa).
export function criarSimulador(ev) {
  let timer = null, peso = 0, zero = 0, inicio = 0, despejando = false, perfil = null;
  // roteiro em segundos a partir do "Despejar água" do simulador: [início, fim, g/s]
  const ROTEIRO = [[0, 6, 6], [40, 50, 6.5], [70, 80, 6.5], [100, 112, 6]]; // ≈ 240 g
  const alvo = (t) => {
    if (t <= perfil[0][0]) return perfil[0][1];
    for (let i = 1; i < perfil.length; i++) {
      const [t1, g1] = perfil[i], [t0, g0] = perfil[i - 1];
      if (t <= t1) return t1 === t0 ? g1 : g0 + (g1 - g0) * (t - t0) / (t1 - t0);
    }
    return perfil[perfil.length - 1][1];
  };
  const tick = () => {
    if (despejando) {
      const t = (performance.now() - inicio) / 1000;
      if (perfil) {
        const falta = alvo(t - 0.6) * 1.004 - (peso - zero); // um pouco atrás da curva e passando 0,4%
        if (falta > 0) peso += Math.min(falta, 0.9) * (0.8 + Math.random() * 0.4);
        if (t > perfil[perfil.length - 1][0] + 3) despejando = false;
      } else {
        const fase = ROTEIRO.find(([a, b]) => t >= a && t < b);
        if (fase) peso += fase[2] * 0.1 * (0.85 + Math.random() * 0.3);
        if (t > 125) despejando = false;
      }
    }
    const ruido = (Math.random() - 0.5) * 0.08;
    ev.peso?.(Math.round((peso - zero + ruido) * 10) / 10);
  };
  return {
    tipo: 'simulador',
    async conectar() {
      ev.estado?.('conectando'); await espera(400);
      peso = 0; zero = 0; despejando = false;
      timer = setInterval(tick, 100);
      ev.estado?.('conectada', 'Demonstração');
      ev.bateria?.(86);
    },
    async desconectar() { clearInterval(timer); timer = null; ev.estado?.('desconectada'); },
    async tara() { zero = peso; },
    // usados pela tela: simulam colocar o café e despejar a água
    colocar(g) { peso += g; },
    despejar() { perfil = null; despejando = true; inicio = performance.now(); },
    despejarPerfil(p) { perfil = p?.length ? p : null; despejando = true; inicio = performance.now(); },
    pedirBateria() {},
  };
}
