import { loadAllContracts } from './registry.js';
import { runHeartbeat } from './heartbeat.js';
import { queryRegistry } from './query.js';
import { sendMessage } from './telegram.js';

const HELP_TEXT = `🦞 ContractClaw — Command Reference

📎 Upload a PDF or DOCX contract to register it.

Commands:
  /start   — What ContractClaw does
  /help    — This message
  /list    — All registered contracts
  /status  — Obligations due in next 30 days
  /digest  — Trigger today's heartbeat now
  /query <question> — Ask anything about your contracts

Examples:
  /query which contracts renew next month?
  /query what are my payment obligations?
  /query is anything overdue?`;

const START_TEXT = `🦞 ContractClaw — Your Vigilant Contract Sentinel

I monitor your business contracts so you never miss a deadline.

Send me a PDF or DOCX contract and I will:
  • Extract every obligation, deadline, and risk clause
  • Save it to your private local registry
  • Alert you at 30 days, 7 days, 1 day, and on overdue

Type /help to see all commands, or just upload a contract to begin.`;

export async function handleSlashCommand(
  command: string,
  chatId: string,
): Promise<void> {
  const cmd = command.trim().toLowerCase();

  if (cmd === '/start') {
    await sendMessage(chatId, START_TEXT);
    return;
  }

  if (cmd === '/help') {
    await sendMessage(chatId, HELP_TEXT);
    return;
  }

  if (cmd === '/list') {
    const manifests = await loadAllContracts();
    if (manifests.length === 0) {
      await sendMessage(chatId, '📭 No contracts registered yet.\n\nUpload a PDF or DOCX to get started.');
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lines = manifests.map((m) => {
      const unresolved = m.obligations.filter((o) => !o.resolved).length;
      const nearest = m.obligations
        .filter((o) => !o.resolved && o.deadline)
        .map((o) => ({ deadline: o.deadline as string, daysRemaining: Math.ceil((new Date(o.deadline as string).getTime() - today.getTime()) / 86400000) }))
        .filter((o) => o.daysRemaining >= 0)
        .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
      const nextDeadline = nearest ? `next: ${nearest.deadline} (${nearest.daysRemaining}d)` : 'no upcoming deadlines';
      return `• ${m.contract_id}\n  ${m.parties.org} ↔ ${m.parties.counterparty}\n  Ends: ${m.dates.end_date ?? 'N/A'} | ${unresolved} open obligations | ${nextDeadline}`;
    });
    await sendMessage(chatId, `📋 Registered Contracts (${manifests.length})\n\n${lines.join('\n\n')}`);
    return;
  }

  if (cmd === '/status') {
    const manifests = await loadAllContracts();
    if (manifests.length === 0) {
      await sendMessage(chatId, '📭 No contracts registered. Upload a contract first.');
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming: string[] = [];
    for (const m of manifests) {
      for (const o of m.obligations) {
        if (o.resolved || !o.deadline) continue;
        const daysRemaining = Math.ceil(
          (new Date(o.deadline).getTime() - today.getTime()) / 86400000,
        );
        if (daysRemaining <= 30) {
          const tier = daysRemaining <= 0 ? '❌ OVERDUE' : daysRemaining <= 1 ? '🚨 URGENT' : daysRemaining <= 7 ? '⚠️ WARNING' : '📋 ADVISORY';
          upcoming.push(`${tier} | ${m.contract_id} | ${o.type}: ${o.description.slice(0, 80)} — ${o.deadline} (${daysRemaining}d)`);
        }
      }
    }
    if (upcoming.length === 0) {
      await sendMessage(chatId, `✅ All clear — no obligations due in the next 30 days.\nMonitoring ${manifests.length} contract(s).`);
    } else {
      await sendMessage(chatId, `📊 Obligations Due Within 30 Days\n\n${upcoming.join('\n')}`);
    }
    return;
  }

  if (cmd === '/digest') {
    await sendMessage(chatId, '⏳ Running heartbeat now...');
    await runHeartbeat([chatId]);
    return;
  }

  if (cmd.startsWith('/query ')) {
    const question = command.slice('/query '.length).trim();
    if (!question) {
      await sendMessage(chatId, 'Usage: /query <your question>\nExample: /query which contracts renew next month?');
      return;
    }
    const answer = await queryRegistry(question);
    await sendMessage(chatId, answer);
    return;
  }

  // Unknown slash command
  await sendMessage(chatId, `Unknown command: ${command}\n\nType /help to see available commands.`);
}

export function isSlashCommand(text: string): boolean {
  return text.trim().startsWith('/');
}
