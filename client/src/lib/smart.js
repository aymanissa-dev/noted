// Smart entries shown in the sidebar (computed views; "recent" is the recently viewed list).
export const SMART = [
  ['recent', 'Recently viewed'],
  ['pinned', 'Pinned'],
  ['today', 'Edited today'],
  ['week', 'This week'],
  ['untagged', 'Untagged'],
  ['locked', 'Locked'],
];
export const smartLabel = (key) => SMART.find(([k]) => k === key)?.[1];
