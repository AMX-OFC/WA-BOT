"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { downloadContentFromMessage } = require("baileys");

/* =====================================================
   MÓDULO DE DIVULGAÇÃO PARA TODOS OS GRUPOS
   COMPATÍVEL COM INDEX.JS / BAILEYS
===================================================== */

module.exports = {
  name: "divulgroup",

  description: "Duplica mensagem marcada e envia para todos os grupos em que o bot está",

  commands: ["divulgroup"],

  usage: "divulgroup (marcando uma mensagem)",

  handle: async (ctx) => {
    const {
      socket,
      remoteJid,
      webMessage,
      reply,
      baseDir,
      info,
      warning,
      error
    } = ctx;

    try {
      // =====================================================
      // 1. OBTÉM A MENSAGEM MARCADA
      // =====================================================

      const quotedDetails = ctx.getQuotedDetails
        ? ctx.getQuotedDetails()
        : null;

      if (
        !quotedDetails ||
        !quotedDetails.raw ||
        Object.keys(quotedDetails.raw).length === 0
      ) {
        return reply(
          "⚠️ Marque uma mensagem válida para divulgar."
        );
      }

      const quotedMsg = quotedDetails.raw;

      const startTime = Date.now();

      // =====================================================
      // 2. DIRETÓRIO TEMPORÁRIO
      // =====================================================

      const dirPath = path.join(
        baseDir,
        "assets",
        "temp",
        "duplicadas"
      );

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {
          recursive: true
        });
      }

      // =====================================================
      // 3. BUSCA TODOS OS GRUPOS DO BOT
      // =====================================================

      let gruposData = {};

      try {
        gruposData = await socket.groupFetchAllParticipating();
      } catch (e) {
        error(
          `Erro ao buscar grupos: ${e?.stack || e?.message || e}`
        );

        return reply(
          "❌ Não foi possível obter a lista de grupos em que o bot está."
        );
      }

      if (
        !gruposData ||
        typeof gruposData !== "object"
      ) {
        return reply(
          "⚠️ Não foi possível obter os grupos do bot."
        );
      }

      // Somente JIDs de grupos
      const grupos = Object.keys(gruposData)
        .filter((jid) => {
          return (
            typeof jid === "string" &&
            jid.endsWith("@g.us")
          );
        });

      if (!grupos.length) {
        return reply(
          "⚠️ O bot não está em nenhum grupo."
        );
      }

      // =====================================================
      // LIMITE DE SEGURANÇA
      // =====================================================

      if (grupos.length > 1440) {
        return reply(
          `⚠️ O bot está em ${grupos.length} grupos.\n\n` +
          `O limite máximo permitido para esta divulgação é de 1440 grupos.`
        );
      }

      const total = grupos.length;

      // =====================================================
      // 4. STATUS INICIAL
      // =====================================================

      const statusMsg = await socket.sendMessage(
        remoteJid,
        {
          text:
            `🚀 *INICIANDO DIVULGAÇÃO*\n\n` +
            `👥 Grupos encontrados: ${total}\n` +
            `📨 Preparando mensagem...`
        },
        {
          quoted: webMessage
        }
      );

      // =====================================================
      // 5. STATUS EM TEMPO REAL
      // =====================================================

      const updateStatus = async (
        current,
        sucesso,
        falha
      ) => {
        const agora = Date.now();

        const tempo =
          (agora - startTime) / 1000;

        const percent =
          total > 0
            ? Math.floor(
                (current / total) * 100
              )
            : 0;

        const tempoPorGrupo =
          current > 0
            ? tempo / current
            : 0;

        const restante =
          tempoPorGrupo *
          (total - current);

        const barraTotal = 20;

        const filled = Math.floor(
          (percent / 100) * barraTotal
        );

        const barra =
          "█".repeat(filled) +
          "░".repeat(
            barraTotal - filled
          );

        const hora =
          new Date().toLocaleTimeString(
            "pt-BR"
          );

        const text = `
🚀 *DIVULGAÇÃO EM TEMPO REAL*

📊 Progresso: ${percent}%
[${barra}]

👥 Grupos processados: ${current}/${total}

✔️ Sucesso: ${sucesso}
❌ Falhas: ${falha}

⚡ Velocidade: ${tempoPorGrupo.toFixed(2)}s/grupo
⏳ Restante: ${restante.toFixed(1)}s
⏱️ Decorrido: ${tempo.toFixed(1)}s

🕒 Hora: ${hora}
`.trim();

        try {
          await socket.sendMessage(
            remoteJid,
            {
              text,
              edit: statusMsg?.key
            }
          );
        } catch {
          try {
            await socket.sendMessage(
              remoteJid,
              {
                text
              }
            );
          } catch {
            // Ignora erro de atualização do status
          }
        }
      };

      // =====================================================
      // 6. IDENTIFICA TIPO DA MENSAGEM
      // =====================================================

      const keys = Object.keys(
        quotedMsg || {}
      );

      const type =
        keys.length
          ? keys[0]
          : null;

      let savedFile = "";
      let sendFn;

      // =====================================================
      // 7. FUNÇÃO PARA BAIXAR MÍDIA
      // =====================================================

      const getBuffer = async (
        msg,
        mediaType
      ) => {
        const stream =
          await downloadContentFromMessage(
            msg,
            mediaType
          );

        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
          buffer = Buffer.concat([
            buffer,
            chunk
          ]);
        }

        return buffer;
      };

      // =====================================================
      // 8. RODAPÉ
      // =====================================================

      const getRodapeInfo = () => {
        const agora = new Date();

        const data =
          agora.toLocaleDateString(
            "pt-BR"
          );

        const hora =
          agora.toLocaleTimeString(
            "pt-BR"
          );

        return (
          `\n\n📅 Data: ${data}` +
          ` | 🕒 Hora: ${hora}` +
          `\n🤖 _Mensagem enviada pelo bot_`
        );
      };

      // =====================================================
      // 9. DELAY ENTRE GRUPOS
      // =====================================================

      const sleep = (ms) =>
        new Promise((resolve) =>
          setTimeout(resolve, ms)
        );

      // 2 minutos entre cada grupo
      const DELAY_ENTRE_GRUPOS =
        2 * 60 * 1000;

      // =====================================================
      // 10. TRATAMENTO DA MENSAGEM
      // =====================================================

      if (
        type === "conversation" ||
        type === "extendedTextMessage"
      ) {
        const originalText =
          quotedMsg.conversation ||
          quotedMsg.extendedTextMessage
            ?.text ||
          "[mensagem vazia]";

        const text =
          originalText +
          getRodapeInfo();

        savedFile = path.join(
          dirPath,
          `text_${Date.now()}.txt`
        );

        fs.writeFileSync(
          savedFile,
          text,
          "utf8"
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              text
            }
          );

      } else if (
        type === "imageMessage"
      ) {
        const originalCaption =
          quotedMsg.imageMessage
            ?.caption || "";

        const caption =
          originalCaption
            ? originalCaption +
              getRodapeInfo()
            : getRodapeInfo().trim();

        const buffer =
          await getBuffer(
            quotedMsg.imageMessage,
            "image"
          );

        savedFile = path.join(
          dirPath,
          `img_${Date.now()}.jpg`
        );

        fs.writeFileSync(
          savedFile,
          buffer
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              image: buffer,
              caption
            }
          );

      } else if (
        type === "videoMessage"
      ) {
        const originalCaption =
          quotedMsg.videoMessage
            ?.caption || "";

        const caption =
          originalCaption
            ? originalCaption +
              getRodapeInfo()
            : getRodapeInfo().trim();

        const buffer =
          await getBuffer(
            quotedMsg.videoMessage,
            "video"
          );

        savedFile = path.join(
          dirPath,
          `video_${Date.now()}.mp4`
        );

        fs.writeFileSync(
          savedFile,
          buffer
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              video: buffer,
              caption
            }
          );

      } else if (
        type === "audioMessage"
      ) {
        const isPTT =
          quotedMsg.audioMessage
            ?.ptt || false;

        const buffer =
          await getBuffer(
            quotedMsg.audioMessage,
            "audio"
          );

        const mimetype =
          quotedMsg.audioMessage
            ?.mimetype ||
          "audio/ogg; codecs=opus";

        savedFile = path.join(
          dirPath,
          `audio_${Date.now()}.ogg`
        );

        fs.writeFileSync(
          savedFile,
          buffer
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              audio: buffer,
              mimetype,
              ptt: isPTT
            }
          );

      } else if (
        type === "documentMessage"
      ) {
        const fileName =
          quotedMsg.documentMessage
            ?.fileName ||
          `doc_${Date.now()}`;

        const mimetype =
          quotedMsg.documentMessage
            ?.mimetype ||
          "application/octet-stream";

        const buffer =
          await getBuffer(
            quotedMsg.documentMessage,
            "document"
          );

        savedFile = path.join(
          dirPath,
          fileName
        );

        fs.writeFileSync(
          savedFile,
          buffer
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              document: buffer,
              mimetype,
              fileName
            }
          );

      } else if (
        type === "stickerMessage"
      ) {
        const buffer =
          await getBuffer(
            quotedMsg.stickerMessage,
            "sticker"
          );

        savedFile = path.join(
          dirPath,
          `stk_${Date.now()}.webp`
        );

        fs.writeFileSync(
          savedFile,
          buffer
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              sticker: buffer
            }
          );

      } else {
        const text =
          JSON.stringify(
            quotedMsg,
            null,
            2
          );

        savedFile = path.join(
          dirPath,
          `unknown_${Date.now()}.txt`
        );

        fs.writeFileSync(
          savedFile,
          text,
          "utf8"
        );

        sendFn = (groupJid) =>
          socket.sendMessage(
            groupJid,
            {
              text:
                "⚠️ Tipo de mensagem não suportado.\n\n" +
                text
            }
          );
      }

      // =====================================================
      // 11. ENVIO PARA TODOS OS GRUPOS
      // =====================================================

      let sucesso = 0;
      let falha = 0;

      for (
        let i = 0;
        i < grupos.length;
        i++
      ) {
        const groupJid =
          grupos[i];

        if (
          !groupJid ||
          typeof groupJid !== "string" ||
          !groupJid.endsWith("@g.us")
        ) {
          falha++;

          await updateStatus(
            i + 1,
            sucesso,
            falha
          );

          continue;
        }

        try {
          await sendFn(groupJid);

          sucesso++;

          info(
            `[DIVULGAÇÃO] Mensagem enviada para ${groupJid}`
          );

        } catch (e) {
          falha++;

          warning(
            `Erro ao enviar para o grupo ${groupJid}: ${
              e?.message || e
            }`
          );
        }

        await updateStatus(
          i + 1,
          sucesso,
          falha
        );

        // Aguarda antes do próximo grupo
        if (
          i < grupos.length - 1
        ) {
          await sleep(
            DELAY_ENTRE_GRUPOS
          );
        }
      }

      // =====================================================
      // 12. FINALIZAÇÃO
      // =====================================================

      await updateStatus(
        total,
        sucesso,
        falha
      );

      info(
        `[DIVULPV OK] Divulgação concluída. ` +
        `Grupos: ${total} | ` +
        `Sucesso: ${sucesso} | ` +
        `Falhas: ${falha} | ` +
        `Arquivo: ${savedFile}`
      );

      // Mensagem final
      try {
        await socket.sendMessage(
          remoteJid,
          {
            text:
              `✅ *DIVULGAÇÃO CONCLUÍDA!*\n\n` +
              `👥 Total de grupos: ${total}\n` +
              `✔️ Enviados com sucesso: ${sucesso}\n` +
              `❌ Falhas: ${falha}\n\n` +
              `🤖 A mensagem foi enviada somente para os grupos em que o bot está.`
          },
          {
            quoted: webMessage
          }
        );
      } catch {
        // Não interrompe o comando se o status final falhar
      }

    } catch (e) {
      error(
        `Erro crítico no divulpv: ${
          e?.stack ||
          e?.message ||
          e
        }`
      );

      return reply(
        "❌ Ocorreu um erro interno ao realizar a divulgação."
      );
    }
  }
};