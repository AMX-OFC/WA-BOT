"use strict";

const fs = require("fs");
const path = require("path");

/* =====================================================
   CONFIGURAÇÃO PRINCIPAL
===================================================== */

const CONFIG = {
  nome: "「 AMHEEX-BOT 」",
  footer: "「 AMHEEX-BOT 」 | Sistema automatizado",

  // Caminho da imagem
  imagem: path.join("assets", "imagem", "icon.png"),

  // Botão de suporte
  suporte: {
    ativo: true,
    texto: "📞 Suporte",
    url: "https://wa.me/5546999020341?text=AMHEEX%20Ol%C3%A1",
  },
};

/* =====================================================
   DIRETÓRIO BASE
===================================================== */

const BASE_DIR = process.cwd();

/* =====================================================
   IMPORTAÇÃO DOS BOTÕES (Caso necessário para interações)
===================================================== */

let sendInteractiveMessage = null;

try {
  const buttonsPath = path.join(
    process.cwd(),
    "src",
    "buttons"
  );

  const buttonsModule = require(buttonsPath);

  if (
    typeof buttonsModule?.sendInteractiveMessage ===
    "function"
  ) {
    sendInteractiveMessage =
      buttonsModule.sendInteractiveMessage;
  }

  console.log("[GRUPO TXT] Sistema de botões carregado.");
} catch (error) {
  console.log(
    "[GRUPO TXT] Sistema de botões indisponível:",
    error?.message || error
  );
}

/* =====================================================
   HELPERS GERAIS
===================================================== */

const esperar = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function obterSocket(ctx) {
  return (
    ctx?.socket ||
    ctx?.sock ||
    ctx?.client ||
    ctx?.conn ||
    ctx
  );
}

function obterMensagem(ctx, p2) {
  return (
    ctx?.webMessage ||
    ctx?.message ||
    ctx?.msg ||
    ctx?.m ||
    p2 ||
    null
  );
}

function obterJid(ctx, mensagem) {
  return (
    ctx?.remoteJid ||
    ctx?.jid ||
    ctx?.from ||
    ctx?.chat ||
    mensagem?.key?.remoteJid ||
    null
  );
}

function normalizarJid(jid) {
  if (!jid) return null;

  const valor = String(jid).trim();

  if (valor.endsWith("@g.us")) {
    return valor;
  }

  if (valor.endsWith("@s.whatsapp.net") || valor.endsWith("@c.us")) {
    return valor.replace("@c.us", "@s.whatsapp.net");
  }

  return null;
}

function extrairTodosInviteCodes(texto = "") {
  const regex = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/gi;
  const codes = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    if (match[1] && !codes.includes(match[1])) {
      codes.push(match[1]);
    }
  }
  return codes;
}

/* =====================================================
   IMAGEM
===================================================== */

function obterCaminhoImagem() {
  const caminhos = [
    path.join(BASE_DIR, CONFIG.imagem),
    path.join(process.cwd(), CONFIG.imagem),
  ];

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) {
      return caminho;
    }
  }

  return null;
}

function obterImagem() {
  const caminho = obterCaminhoImagem();

  if (!caminho) {
    return null;
  }

  try {
    return fs.readFileSync(caminho);
  } catch (error) {
    return null;
  }
}

/* =====================================================
   ENVIO DE TEXTO / MENSAGENS
===================================================== */

async function enviarTexto(
  socket,
  jid,
  texto,
  quoted = null
) {
  return socket.sendMessage(
    jid,
    {
      text: String(texto),
    },
    {
      quoted: quoted || undefined,
    }
  );
}

/* =====================================================
   MÓDULO PRINCIPAL
===================================================== */

module.exports = {
  name: "entrargrupostxt",

  prefixes: ["entrargrupostxt"],

  commands: [
    "entrargrupostxt",
  ],

  aliases: [
    "entrartextogrupo",
    "grupostxt",
  ],

  description:
    "📁 Entra automaticamente em grupos de WhatsApp usando os links contidos em src/index.txt",

  usage:
    "entrargrupostxt",

  handle: async (ctx = {}, p2, p3) => {
    const socket = obterSocket(ctx);
    const webMessage = obterMensagem(ctx, p2);
    const remoteJid = obterJid(ctx, webMessage);

    const enviarResposta = async (mensagem) => {
      if (!socket || !remoteJid) {
        return;
      }

      return enviarTexto(
        socket,
        remoteJid,
        `🤖 ${mensagem}`,
        webMessage
      );
    };

    try {
      if (!socket) {
        console.log("[GRUPO TXT] Socket não encontrado.");
        return;
      }

      if (!remoteJid) {
        console.log("[GRUPO TXT] JID não encontrado.");
        return;
      }

      const caminhoTxt = path.join(BASE_DIR, "src", "index.txt");

      if (!fs.existsSync(caminhoTxt)) {
        return enviarResposta(`Arquivo não encontrado em: src/index.txt`);
      }

      let conteudoTxt;
      try {
        conteudoTxt = fs.readFileSync(caminhoTxt, "utf8");
      } catch (err) {
        return enviarResposta("Erro ao ler o arquivo src/index.txt.");
      }

      const inviteCodes = extrairTodosInviteCodes(conteudoTxt);

      if (!inviteCodes.length) {
        return enviarResposta("Nenhum link de convite do WhatsApp foi encontrado no arquivo src/index.txt.");
      }

      await enviarResposta(`📁 Encontrados ${inviteCodes.length} links no TXT. Iniciando entrada nos grupos...`);

      let sucessos = 0;
      let falhas = 0;

      for (let i = 0; i < inviteCodes.length; i++) {
        const code = inviteCodes[i];
        try {
          const grupoJid = await socket.groupAcceptInvite(code);
          const normalized = normalizarJid(grupoJid);
          sucessos++;
          console.log(`[ENTRADA TXT] Sucesso (${i + 1}/${inviteCodes.length}): JID -> ${normalized || grupoJid}`);
        } catch (error) {
          falhas++;
          console.log(`[ENTRADA TXT] Erro ao entrar no link ${code}:`, error?.message || error);
        }

        if (i + 1 < inviteCodes.length) {
          await esperar(2000); // Pausa de 2 segundos entre as entradas para evitar bloqueios
        }
      }

      return enviarResposta(
        `✅ Processo de entrada finalizado!\n\n` +
        `📥 Total de links: ${inviteCodes.length}\n` +
        `✨ Entradas com sucesso: ${sucessos}\n` +
        `❌ Falhas / Já membro: ${falhas}`
      );

    } catch (error) {
      console.error(
        "[GRUPO TXT] Erro geral:",
        error?.stack ||
          error?.message ||
          error
      );

      return enviarResposta(
        "Erro interno ao executar o comando de entrada por TXT."
      );
    }
  },
};
