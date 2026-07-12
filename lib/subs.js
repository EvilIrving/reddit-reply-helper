/** @typedef {{ name: string, style: string, keywords: string[], avoid: string[] }} SubProfile */

/** @type {Record<string, SubProfile>} */
export const SUB_PROFILES = {
  askreddit: {
    name: 'AskReddit',
    style: 'casual_story',
    keywords: ['what', 'who', 'when', 'why', 'how', 'worst', 'best', 'ever', 'people', 'reddit'],
    avoid: ['am i the', 'relationship advice'],
  },
  standupcomedy: {
    name: 'StandUpComedy',
    style: 'comedy_craft',
    keywords: ['set', 'bit', 'open mic', 'crowd', 'joke', 'special', 'comic', 'stage', 'bomb'],
    avoid: ['buy my', 'check out my special'],
  },
  claudeai: {
    name: 'ClaudeAI',
    style: 'tech_specific',
    keywords: ['claude', 'prompt', 'api', 'opus', 'sonnet', 'project', 'artifact', 'limit', 'context'],
    avoid: ['best ai ever', 'game changer'],
  },
  cats: {
    name: 'cats',
    style: 'warm_short',
    keywords: ['cat', 'kitten', 'meow', 'litter', 'vet', 'purr', 'rescue'],
    avoid: ['buy', 'breeding for sale'],
  },
  macapps: {
    name: 'macapps',
    style: 'tech_specific',
    keywords: ['app', 'macos', 'shortcut', 'alternative', 'free', 'open source', 'm1', 'm2', 'm3', 'm4', 'sequoia', 'sonoma'],
    avoid: ['affiliate', 'use my code'],
  },
};

export const DEFAULT_SUBS = Object.keys(SUB_PROFILES);

/**
 * @param {string} sub
 */
export function normalizeSub(sub) {
  return (sub || '').replace(/^r\//i, '').trim().toLowerCase();
}

/**
 * @param {string} sub
 */
export function getProfile(sub) {
  return SUB_PROFILES[normalizeSub(sub)] || null;
}
