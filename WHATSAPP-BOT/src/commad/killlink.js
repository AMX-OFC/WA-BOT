"use strict";

/* =====================================================
   ESTADO GLOBAL DO ANTI-LINK & LISTA DE ISENTOS
===================================================== */
let ativoGlobal = false;
const isentosMap = new Set();

/* =====================================================
   HELPERS DE EXTRAÇÃO E VALIDAÇÃO
===================================================== */

/**
 * Extrai o texto contido em qualquer tipo de estrutura da mensagem do WhatsApp
 */
function extrairTextoMensagem(webMessage) {
  if (!webMessage?.message) return "";

  const msg = webMessage.message;

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

/**
 * Verifica se o texto contém qualquer tipo de link/URL
 */
function contemLink(texto = "") {
  if (!texto) return false;
  
  // Detecta http, https, www, domínios (.com, .br, etc), wa.me e convites do WhatsApp
  const regexLink = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|br|net|org|io|me|app|dev|xyz|info)[^\s]*|chat\.whatsapp\.com\/[A-Za-z0-9_-]+|wa\.me\/[0-9]+)/i;
  return regexLink.test(texto);
}

function normalizarJid(jid = "") {
  if (!jid) return "";
  const apenasNumeros = String(jid).replace(/[^0-9]/g, "");
  if (!apenasNumeros) return "";
  return `${apenasNumeros}@s.whatsapp.net`;
}

function extrairNumero(texto = "") {
  return String(texto).replace(/[^0-9]/g, "");
}

/* =====================================================
   MÓDULO PRINCIPAL
===================================================== */

module.exports = {
  name: "killlink",

  prefixes: ["killlink", "antilink"],

  commands: ["killlink", "antilink"],

  aliases: ["anti-link", "sem-link"],

  description: "🚫 Remove mensagens com links de qualquer pessoa (inclusive ADMs), exceto números cadastrados.",

  usage: "killlink [on | off | <NUMERO> | del <NUMERO> | lista | reset]",

  handle: async (ctx = {}, webMessage, args = []) => {
    const socket = ctx?.socket || ctx?.sock;
    const remoteJid = ctx?.remoteJid || ctx?.jid;

    if (!socket || !remoteJid) return;

    const primeiroArg = String(args[0] || "").trim().toLowerCase();

    /* =====================================================
       1. COMANDOS DE ATIVAÇÃO / DESATIVAÇÃO GLOBAL
    ===================================================== */
    if (primeiroArg === "off" || primeiroArg === "desativar") {
      ativoGlobal = false;
      return ctx.reply("✅ *Anti-link global desativado* para todos os grupos.");
    }

    if (primeiroArg === "on" || primeiroArg === "ativar") {
      ativoGlobal = true;
      return ctx.reply("🚫 *Anti-link global ativado!* O bot removerá links de QUALQUER pessoa (incluindo ADMs), exceto números cadastrados.");
    }

    /* =====================================================
       2. LISTAR ISENTOS
    ===================================================== */
    if (primeiroArg === "lista" || primeiroArg === "list") {
      if (isentosMap.size === 0) {
        return ctx.reply("📋 *Lista de Isentos:* Nenhum número cadastrado no momento.");
      }
      let mensagem = "📋 *Lista de Números Permitidos a Enviar Links:*\n\n";
      let contador = 1;
      for (const jid of isentosMap) {
        const num = jid.replace("@s.whatsapp.net", "");
        mensagem += `${contador}. +${num}\n`;
        contador++;
      }
      return ctx.reply(mensagem);
    }

    /* =====================================================
       3. REMOVER UM NÚMERO DA LISTA DE ISENTOS
    ===================================================== */
    if (primeiroArg === "del" || primeiroArg === "remover" || primeiroArg === "remove") {
      const numParaRemover = extrairNumero(args[1]);
      if (!numParaRemover) {
        return ctx.reply("⚠️ Informe o número para remover. Exemplo: *killlink del 5511999999999*");
      }
      const jidAlvo = normalizarJid(numParaRemover);
      if (isentosMap.has(jidAlvo)) {
        isentosMap.delete(jidAlvo);
        return ctx.reply(`❌ O número *+${numParaRemover}* foi removido da lista de isentos.`);
      } else {
        return ctx.reply(`⚠️ O número *+${numParaRemover}* não estava na lista de isentos.`);
      }
    }

    /* =====================================================
       4. LIMPAR TODOS OS ISENTOS
    ===================================================== */
    if (primeiroArg === "reset" || primeiroArg === "limpar") {
      isentosMap.clear();
      return ctx.reply("🧹 Lista de isentos limpa com sucesso!");
    }

    /* =====================================================
       5. ADICIONAR NÚMERO ISENTO (Ex: killlink 5511999999999)
    ===================================================== */
    const numeroApenasDigitos = extrairNumero(primeiroArg);

    if (numeroApenasDigitos.length >= 8) {
      const jidIsento = normalizarJid(numeroApenasDigitos);
      
      if (isentosMap.has(jidIsento)) {
        return ctx.reply(`ℹ️ O número *+${numeroApenasDigitos}* já está cadastrado como isento.`);
      }

      isentosMap.add(jidIsento);
      ativoGlobal = true;

      return ctx.reply(
        `✅ *Número Cadastrado com Sucesso!*\n\n` +
        `👤 *Isento:* +${numeroApenasDigitos}\n` +
        `🚫 *Anti-Link:* ATIVO (Remove links de todos, exceto este número).`
      );
    }

    /* =====================================================
       6. ALTERNAR ESTADO CASO NENHUM PARÂMETRO FOR PASSADO
    ===================================================== */
    ativoGlobal = !ativoGlobal;
    if (ativoGlobal) {
      return ctx.reply("🚫 *Anti-link global ativado!* O bot removerá links de QUALQUER pessoa, exceto números cadastrados.");
    } else {
      return ctx.reply("✅ *Anti-link global desativado*.");
    }
  },

  /* =====================================================
     VERIFICAÇÃO DE MENSAGENS EM TEMPO REAL
  ===================================================== */
  checarMensagem: async (socket, webMessage, textoParametro = "") => {
    if (!ativoGlobal) return;

    const remoteJid = webMessage?.key?.remoteJid;

    // 1. Verifica se a mensagem veio de um grupo
    if (!remoteJid || !remoteJid.endsWith("@g.us")) return;

    // 2. Extrai o texto garantindo que qualquer mídia/legenda seja analisada
    const textoCompleto = textoParametro || extrairTextoMensagem(webMessage);

    // 3. Checa se existe link no texto
    if (!contemLink(textoCompleto)) return;

    try {
      // 4. Obter metadados do grupo e verificar se o Bot é ADM
      const groupMetadata = await socket.groupMetadata(remoteJid);
      const participantes = groupMetadata?.participants || [];

      const botJidRaw = socket?.user?.id || socket?.user?.jid || "";
      const botJid = normalizarJid(botJidRaw);

      const botInfo = participantes.find((p) => normalizarJid(p.id) === botJid);
      const botEhAdmin = botInfo?.admin === "admin" || botInfo?.admin === "superadmin";

      // Se o BOT NÃO for ADM, ignora (não consegue apagar)
      if (!botEhAdmin) return;

      // 5. Identificar quem enviou a mensagem
      const remetenteRaw = webMessage?.key?.participant || webMessage?.participant || remoteJid;
      const remetente = normalizarJid(remetenteRaw);

      // 6. Se o número estiver na lista de isentos, ignora
      if (isentosMap.has(remetente)) {
        console.log(`[KILLLINK] Link ignorado do número isento: ${remetente}`);
        return;
      }

      // 7. Remove a mensagem do grupo
      await socket.sendMessage(remoteJid, {
        delete: webMessage.key,
      });

      console.log(`[KILLLINK] Link apagado no grupo ${remoteJid} enviado por ${remetente}`);
    } catch (error) {
      console.error("[KILLLINK] Erro ao processar remoção do link:", error?.message || error);
    }
  }
};
