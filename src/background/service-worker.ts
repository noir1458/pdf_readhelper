import type { ExtensionMessage } from "../shared/messages";

chrome.commands.onCommand.addListener((command) => {
  if (command !== "copy-current-page") return;
  void triggerViewerCommand();
});

async function triggerViewerCommand(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    tab?.id === undefined ||
    !tab.url?.startsWith(chrome.runtime.getURL("src/viewer/viewer.html"))
  ) {
    return;
  }
  const message: ExtensionMessage = {
    type: "TRIGGER_COPY_PAGE",
    targetTabId: tab.id,
  };
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}
