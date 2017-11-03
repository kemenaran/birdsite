// Mastodon instances can be on many domains.
//
// To detect whether the extension should be loaded and activated,
// this light content script is injected into every web page, and
// attempts to detect the presence of the Mastodon web app.
//
// If a Mastodon web app is running in the current tab, it sends
// a message to the background extension, which will inject the
// main extension code dynamically.

let mastodonWebAppRoot = document.querySelector('.app-holder#mastodon');
if (mastodonWebAppRoot) {
  chrome.runtime.sendMessage({ type: 'inject_content_scripts' }, function() {});
} else {
  // No Mastodon web app detected: do nothing.
}
