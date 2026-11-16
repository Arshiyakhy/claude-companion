# Cat side chat

A cat that sits in the corner of claude.ai with its ball of yarn. Hover it and it
swats the ball to the left: the ball rolls away and unwinds into a chat bar,
getting smaller as the bar gets longer, until it is used up. Ask a side question
about the chat you are in, or type / for commands. The answer stays in the cat's
panel and nothing is written into the main chat. The cat blinks, and its eyes
follow the ball and then your mouse.

The cat, the menu and the chat take their colors and font from your Claude
theme, light or dark, and switch when you switch.

## Install (Chrome or Edge)

1. Unzip this folder somewhere you will keep it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `cat-extension` folder.
4. Open or reload a chat on claude.ai. The cat sits in the bottom right corner.

To update: replace the folder, press the reload arrow on the extension's card
in `chrome://extensions`, then reload the Claude tab.

## Use

1. Highlight something in the chat (optional).
2. Hover the cat. When the bar opens, click into it.
3. Type a question and press Enter, or type / (or press the / button) to see
   the commands. Arrow keys move, Enter or Tab picks.
4. Tab+Enter or Shift+Enter makes a new line.
5. **End** stops the side chat. The X or Escape folds everything back into the cat.
   If you have not typed anything, moving the mouse away does the same.

Switching to another chat closes the side chat, since it belongs to the chat
it was opened from.

## Files

| File | Job |
|---|---|
| `manifest.json` | Tells Chrome to run the scripts on claude.ai |
| `shell.js` | The cat's hover zone, the chat bar, the / menu and the side chat panel |
| `cat-roll.js` | Draws the cat and the rolling yarn ball for any point of the timeline |
| `logo-data.js` | The cat logo traced into pieces: head, eyes, paw, ball, thread |
| `theme.js` | Reads the page's colors and font and follows theme changes |
| `markdown.js` | Formats answers (code, bold, lists) safely |
| `brain.js` | The commands (only `branch` so far) |
| `reader.js` | Reads the main chat and the highlighted text |
| `asker.js` | Sends the question through your own Claude account |
| `store.js` | Saves side chats in the extension's storage |

## Good to know

- `reader.js` and `asker.js` call addresses on claude.ai that are not
  official or documented. They can stop working when the site changes, and
  automating the site may be against Anthropic's terms.
- Each side chat creates a hidden conversation in your account and deletes it
  when the side chat closes.
- Side questions count toward your normal usage limits.
