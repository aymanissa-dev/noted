import Note from '../models/Note.js';

// First-run sample note (created when the web app registers with { sample: true }). Deletable like any note.
export const WELCOME_TITLE = 'Welcome to noted.';
export const WELCOME_CONTENT = `This note is a short tour. Delete it whenever you like: open the ••• menu and choose Move to trash.

## The basics
- [ ] Press **N** for a new note, **/** to search, **?** for every shortcut
- [ ] Type a quick note on the main page and press Enter. #tags in it become tags
- [ ] Notes save as you type, and keep working offline

## Writing
Type / at the start of a line for headings, checklists, dividers and today's date. Select text to ==highlight== it, or type : for emoji. Click the arrow beside a heading to fold its section.

## Staying organized
Pin what matters, file notes into folders, and archive what you don't need every day. Every note keeps a version history, and private notes can be locked with a PIN (set it in Settings).

## Your data
Export everything as JSON or Markdown, or make an encrypted backup, from Settings.`;

export const createWelcomeNote = (userId) => Note.create({
  user: userId, title: WELCOME_TITLE, content: WELCOME_CONTENT, tags: ['welcome'], pinned: true, emoji: '👋',
});
