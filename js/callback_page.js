/**
 * This script is injected into the callback page where the Twitter authentication
 * redirects the user at the end of the flow.
 *
 * The URL query params contains the generated access tokens.
 */

// Pass the query params to the background extension page
let message = {
  type: 'auth',
  session: window.location.search.substr(1)
};

chrome.runtime.sendMessage(message, function(response) {
  // Now that the message has been received, close the pop-up window.
	window.open('', '_self', '');
	window.close();
});
