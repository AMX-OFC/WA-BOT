"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* =====================================================
   MÓDULO DE ADIÇÃO AUTOMÁTICA DE CONTATOS COM FALLBACK DE CONVITE
===================================================== */

module.exports = {
  name: "addcontatos",
  description: "Adiciona contatos ao grupo (1 a cada 60s) ou envia convite se falhar",
  commands: ["addcontatos", "adicionarcontatos"],
  usage: "addcontatos",

  handle: async (ctx) => {
    const {
      socket,
      remoteJid,
      reply,
      baseDir
    } = ctx;

    const rootDir = baseDir || process.cwd();
    const filePath = path.join(rootDir, "assets", "database", "contatos.json");

    try {
      // ⚠️ Verifica se está em um grupo
      if (!remoteJid || !remoteJid.endsWith("@g.us")) {
        return reply("⚠️ Este comando só pode ser usado dentro de um grupo.");
      }

      // ⚠️ Verifica se o arquivo de contatos existe
      if (!fs.existsSync(filePath)) {
        return reply("⚠️ Nenhum arquivo de contatos encontrado. Use /extraircontatos primeiro.");
      }

      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (e) {
        console.error(`JSON inválido em contatos.json: ${e.message}`);
        return reply("❌ Erro ao ler contatos.json (formato inválido).");
      }

      let contatos = [];
      if (Array.isArray(data.listaGeralUnica)) {
        contatos = data.listaGeralUnica;
      } else if (Array.isArray(data.contatos)) {
        contatos = data.contatos;
      }

      if (!contatos.length) {
        return reply("⚠️ Nenhum contato salvo em contatos.json.");
      }

      // 🔍 Pega os metadados do grupo
      const metadata = await socket.groupMetadata(remoteJid);
      const participantesAtuais = metadata.participants.map((p) => p.id);

      // Obtém ou gera o link de convite do grupo para usar como fallback
      let inviteCode = "";
      let inviteLink = "";
      try {
        inviteCode = await socket.groupInviteCode(remoteJid);
        inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
      } catch (err) {
        console.error("[AVISO] Não foi possível obter o código de convite do grupo:", err.message);
      }

      // Filtra contatos válidos e que não estão no grupo
      const jidsParaAdicionar = [];
      for (const contato of contatos) {
        if (typeof contato !== "string") continue;
        const match = contato.match(/^(\d+)@(lid|s\.whatsapp\.net)$/);
        const numeroLimpo = contato.replace(/@.+$/, "");
        const numero = match ? match[1] : (/^\d+$/.test(numeroLimpo) ? numeroLimpo : null);

        if (numero && numero.length >= 10 && numero.length <= 15) {
          const jid = `${numero}@s.whatsapp.net`;
          if (!participantesAtuais.includes(jid)) {
            jidsParaAdicionar.push(jid);
          }
        }
      }

      if (jidsParaAdicionar.length === 0) {
        return reply("⚠️ Todos os contatos do arquivo já estão participando deste grupo.");
      }

      await reply(`🚀 Processo iniciado! Adicionando até **${jidsParaAdicionar.length} usuários** (1 a cada 60s). Se falhar, tentaremos enviar o convite no privado.`);

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      let adicionadosComSucesso = 0;
      let convitesEnviados = 0;
      let falhasTotais = 0;
      let grupoLotado = false;

      for (let i = 0; i < jidsParaAdicionar.length; i++) {
        const targetJid = jidsParaAdicionar[i];
        
        try {
          const res = await socket.groupParticipantsUpdate(remoteJid, [targetJid], "add");
          const participantResult = Array.isArray(res) ? res[0] : res;
          const status = participantResult?.status || 200;

          if (status === 200 || status === "200" || !participantResult?.status) {
            adicionadosComSucesso++;
            console.log(`[ADD] Sucesso ao adicionar ${targetJid} (${i + 1}/${jidsParaAdicionar.length})`);
          } else {
            console.log(`[ADD] Falha ao adicionar ${targetJid}. Status: ${status}`);
            
            // Verifica se o grupo lotou
            if (status === 403 || status === 409 || String(status).includes("full") || String(status).includes("limit")) {
              grupoLotado = true;
              await reply("⚠️ O grupo atingiu a lotação máxima. Parando o processo.");
              break;
            }

            // Se falhou (ex: 404, 403 de privacidade), tenta enviar o convite no privado caso tenha o link
            if (inviteLink && status !== 404) {
              try {
                await socket.sendMessage(targetJid, {
                  text: `Olá! Não consegui te adicionar diretamente ao grupo *${metadata.subject || "do WhatsApp"}* devido às suas configurações de privacidade. Caso queira entrar, acesse pelo link:\n\n${inviteLink}`
                });
                convitesEnviados++;
                console.log(`[CONVITE] Enviado no privado para ${targetJid}`);
              } catch (privErr) {
                console.log(`[CONVITE] Não foi possível enviar no privado para ${targetJid}: ${privErr.message}`);
                falhasTotais++;
              }
            } else {
              falhasTotais++;
            }
          }
        } catch (err) {
          console.error(`[ADD] Erro ao adicionar ${targetJid}:`, err.message);

          if (err.message && (err.message.includes("403") || err.message.toLowerCase().includes("full"))) {
            grupoLotado = true;
            await reply("⚠️ O grupo atingiu a lotação máxima. Parando o processo.");
            break;
          }

          // Tenta fallback de convite se o erro não for 404 absoluto de número inexistente
          if (inviteLink && !err.message.includes("404")) {
            try {
              await socket.sendMessage(targetJid, {
                text: `Olá! Tentei te adicionar ao grupo *${metadata.subject || "do WhatsApp"}*, mas ocorreu uma restrição. Entre por este link:\n\n${inviteLink}`
              });
              convitesEnviados++;
            } catch {
              falhasTotais++;
            }
          } else {
            falhasTotais++;
          }
        }

        // Intervalo de 60 segundos entre cada ação
        if (i < jidsParaAdicionar.length - 1 && !grupoLotado) {
          await sleep(60000);
        }
      }

      // Relatório final
      return socket.sendMessage(remoteJid, {
        text: `📊 *Relatório de Adição & Convites Concluído!*\n\n` +
              `✅ Adicionados direto: *${adicionadosComSucesso}*\n` +
              `📩 Convites enviados no privado: *${convitesEnviados}*\n` +
              `❌ Falhas (contatos inválidos/404): *${falhasTotais}*\n` +
              `👥 Status do Grupo: *${grupoLotado ? "Lotado 🛑" : "Finalizado ✅"}*`
      });

    } catch (e) {
      console.error(`Erro no comando addcontatos: ${e?.stack || e?.message || e}`);
      return reply("❌ Ocorreu um erro interno ao tentar processar os contatos.");
    }
  },
};
