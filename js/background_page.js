/**
 * This script is run into the extension permanent page.
 * It receives messages from the content web pages, and reacts accordingly.
 */

// When bootstrap.js detects the Mastodon web app,
// inject the extension scripts into the Mastodon page.
async function injectContentScripts(request, sender, response) {
  // Load order-independant scripts all at once...
  // (because it is faster than loading them one-by-one)
  await Promise.all([
    _toPromise(chrome.tabs.insertCSS)({ file: "/css/birdsite.css", runAt: 'document_start' }),
    _toPromise(chrome.tabs.executeScript)({ file: "/js/lib/sha1.js", runAt: 'document_start' }),
    _toPromise(chrome.tabs.executeScript)({ file: "/js/lib/oauth.js", runAt: 'document_start' }),
    _toPromise(chrome.tabs.executeScript)({ file: "/js/lib/twitter.js", runAt: 'document_start' }),
    _toPromise(chrome.tabs.executeScript)({ file: "/js/content_scripts/mastodon/birdsite_ui.js", runAt: 'document_start' })
  ]);
  // ...then load the final script that will run the extension.
  await _toPromise(chrome.tabs.executeScript)({ file: "/js/content_scripts/mastodon/birdsite.js", runAt: 'document_start' });
}

// When the Twitter authentication pop-up redirects to our callback page,
// forward the call to the Mastodon web page.
function authenticationCallback(request, sender, sendResponse) {
  let twitterClient = new TwitterClient();
  twitterClient.completeAuthentication(request.queryParams);
}

// Helper: takes a function that normally uses a callback as the last argument,
// and returns a function which returns a Promise instead.
function _toPromise(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      try {
        fn(...args, function(...res) {
          if (chrome.runtime.lastError) { throw chrome.runtime.lastError; }
          else { resolve(...res); }
        });
      } catch(e) { reject(e); }
    });
  };
}

// Initialize the listener for messages sent by the content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type == 'inject_content_scripts') {
    injectContentScripts(request, sender, sendResponse);

  } else if (request.type == 'authentication_callback') {
    authenticationCallback(request, sender, sendResponse);

  } else {
    console.warning(`Unhandled message (${JSON.stringify(request)})`);
  }
});
