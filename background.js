import { analyzePosts, resolveRecommendation, getNextPending } from './lib/analyze.js';
import {
  getSettings,
  saveSettings,
  getQueue,
  countPendingQueue,
  recordVisitedSubs,
  getVisitedSubs,
  setRecentSubs,
  updateQueueItem,
  removeProcessedQueueItems,
  clearQueue,
} from './lib/settings.js';
import { ensureDailyPost, setDailyStatus } from './lib/daily.js';
import { translateToEnglish } from './lib/deepseek.js';

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    /* ignore */
  }
  refreshBadge();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    /* ignore */
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

/**
 * @param {any} msg
 * @param {chrome.runtime.MessageSender} sender
 */
async function handleMessage(msg, sender) {
  if (!msg?.type) return { ok: false, error: 'no type' };

  switch (msg.type) {
    case 'RRH_GET_SETTINGS':
      return {
        ok: true,
        settings: await getSettings(),
      };

    case 'RRH_RECORD_VISITED': {
      const visited = await recordVisitedSubs(msg.subs || msg.sub || []);
      return { ok: true, visited };
    }

    case 'RRH_GET_VISITED':
      return { ok: true, visited: await getVisitedSubs() };

    case 'RRH_SET_RECENT_SUBS': {
      const recent = await setRecentSubs(msg.subs || []);
      return { ok: true, recent };
    }

    case 'RRH_SAVE_SETTINGS': {
      const settings = await saveSettings(msg.patch || {});
      // notify all reddit tabs
      broadcastToReddit({ type: 'RRH_SETTINGS_UPDATED', settings });
      return { ok: true, settings };
    }

    case 'RRH_ANALYZE_POSTS': {
      const result = await analyzePosts(msg.posts || [], { forceId: msg.forceId });
      if (result.recommendation && sender.tab?.id) {
        try {
          await chrome.tabs.sendMessage(sender.tab.id, {
            type: 'RRH_SHOW_OVERLAY',
            item: result.recommendation,
            settingsHint: result.settingsHint,
            pending: result.pending,
          });
        } catch {
          /* tab may not have overlay yet */
        }
      } else if (sender.tab?.id && typeof result.pending === 'number') {
        try {
          await chrome.tabs.sendMessage(sender.tab.id, {
            type: 'RRH_PENDING_UPDATE',
            pending: result.pending,
          });
        } catch {
          /* ignore */
        }
      }
      return result;
    }

    case 'RRH_RESOLVE': {
      const r = await resolveRecommendation(msg.id, msg.status);
      if (sender.tab?.id) {
        try {
          await chrome.tabs.sendMessage(sender.tab.id, {
            type: 'RRH_OVERLAY_RESOLVED',
            id: msg.id,
            status: msg.status,
            resumeCruise: !!msg.resumeCruise,
            pending: r.pending,
          });
        } catch {
          /* ignore */
        }
      }
      return r;
    }

    case 'RRH_GET_QUEUE':
      return { ok: true, queue: await getQueue(), pending: await countPendingQueue() };

    case 'RRH_UPDATE_QUEUE_ITEM': {
      await updateQueueItem(msg.id, msg.patch || {});
      return { ok: true };
    }

    case 'RRH_CLEAR_PROCESSED': {
      const queue = await removeProcessedQueueItems();
      await refreshBadge();
      return { ok: true, queue, pending: await countPendingQueue() };
    }

    case 'RRH_CLEAR_QUEUE': {
      const queue = await clearQueue();
      await refreshBadge();
      broadcastToReddit({ type: 'RRH_PENDING_UPDATE', pending: 0 });
      return { ok: true, queue, pending: 0 };
    }

    case 'RRH_TRANSLATE_TO_ENGLISH': {
      const text = String(msg.text || '').trim();
      if (!text) return { ok: false, error: '没有可翻译的内容' };
      if (text.length > 12000) return { ok: false, error: '内容过长，请缩短后再试' };
      const settings = await getSettings();
      const translated = await translateToEnglish(text, settings);
      return { ok: true, translated };
    }

    case 'RRH_GET_NEXT_PENDING':
      return getNextPending(msg.excludeId);

    case 'RRH_ENSURE_DAILY':
      return ensureDailyPost({ force: !!msg.force, subs: msg.subs });

    case 'RRH_DAILY_STATUS':
      return setDailyStatus(msg.status, msg.candidateIndex);

    case 'RRH_OPEN_SIDE_PANEL': {
      if (sender.tab?.id) {
        try {
          await chrome.sidePanel.open({ tabId: sender.tab.id });
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    }

    case 'RRH_CRUISE_STATE':
      // content informs SW — optional logging
      return { ok: true };

    default:
      return { ok: false, error: `unknown type ${msg.type}` };
  }
}

async function refreshBadge() {
  try {
    const n = await countPendingQueue();
    await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff4500' });
  } catch {
    /* ignore */
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.rrh_queue) refreshBadge();
});

/**
 * @param {any} message
 */
async function broadcastToReddit(message) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://www.reddit.com/*', '*://old.reddit.com/*', '*://new.reddit.com/*'],
    });
    for (const t of tabs) {
      if (!t.id) continue;
      try {
        await chrome.tabs.sendMessage(t.id, message);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
