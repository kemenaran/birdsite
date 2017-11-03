const TWITTER_API_URL         = 'https://api.twitter.com/';
const TWITTER_CONSUMER_KEY    = '9Y6TkkJkq65aBTi07ozaNYgP7';
const TWITTER_CONSUMER_SECRET = 'NhVLcbe4WD2rGUHxRUsdhCvLFIkjqWHqrkFIIYQ0sXV5Zo4R7w';

// Manage the authentication flow and authenticated requests
// against the Twitter API.
class TwitterClient {
  constructor() {
    this.api_url         = TWITTER_API_URL;
    this.consumer_key    = TWITTER_CONSUMER_KEY;
    this.consumer_secret = TWITTER_CONSUMER_SECRET;

    this.oauth_token = null;
    this.oauth_token_secret = null;
    this.screen_name = null;

    this.resolveAuthentication = null;
    this.rejectAuthentication = null;
  }

  // Load saved Twitter credentials.
  // Returns a promise that will be resolved with the credentials if found,
  // and rejected otherwise.
  loadCredentials() {
    return this._fetchStoredCredentials()
    .then((credentials) => {
      let isLoggedIn = credentials.oauth_token && credentials.oauth_token_secret && credentials.screen_name;
      if (isLoggedIn) {
        this._setCredentials(credentials);
        return credentials.screen_name;
      } else {
        throw new Error('No Twitter API credentials found');
      }
    });
  }

  // Ensure the user is authenticated.
  // If yes, quickly returns a resolved Promise.
  // If no, start the OAuth flow, and return a promise that will resolve at the end of the flow.
  authenticate() {
    return this.loadCredentials()
    .catch(() => {
      return this._startAuthentication();
    });
  }

  // Finish the last authentication step, by providing the query parameters
  // sent by Twitter to the callback pop-up page.
  //
  // This method is intended to be called from the background extension page.
  // It will send a message to the content page, in order to resolves (or reject)
  // the promise returned by `authenticate`.
  completeAuthentication(queryParams) {
    var params = this._deparam(queryParams);

    this.api('oauth/access_token', 'POST', params)
    .then(response => response.text())
    .then((responseText) => {
      return this._setCredentials(this._deparam(responseText));
    })
    .then(() => {
      this._sendMessageToContentPage({ authState: 'success' });
    })
    .catch((error) => {
      this._sendMessageToContentPage({ authState: 'failure', error: error });
    });
  }

  // Send a request to the Twitter API.
  // Returns a promise that resolves when the request finishes.
  api(path /*, method, params */) {
    var args = Array.prototype.slice.call(arguments, 1),
        params = {},
        method = 'GET';

    /* Parse arguments to their appropriate position */
    for(var i in args) {
      switch(typeof args[i]) {
        case 'object':
          params = args[i];
        break;
        case 'string':
          method = args[i].toUpperCase();
        break;
      }
    }

    /* Add an oauth token if it is an api request */
    params.oauth_token = params.oauth_token || this.oauth_token;

    /* Add a 1.1 and .json if its not an authentication request */
    (!path.match(/oauth/)) && (path = '1.1/' + path + '.json');

    var accessor = {consumerSecret: this.consumer_secret, tokenSecret: this.oauth_token_secret},
      message = {
        action: this.api_url + path,
        method: method,
        parameters: [['oauth_consumer_key', this.consumer_key], ['oauth_signature_method', 'HMAC-SHA1']]
      };

    Object.entries(params).forEach(([key, value]) => {
      OAuth.setParameter(message, key, value);
    });

    OAuth.completeRequest(message, accessor);

    var requestParams = new URLSearchParams();
    Object.entries(OAuth.getParameterMap(message.parameters)).forEach(([key, value]) => {
      if (value == null) {
        value = '';
      }
      requestParams.append(key, value);
    });

    return fetch(this.api_url + path, { method: method, body: requestParams })
      .catch((response) => {
        if(res && res.responseText && res.responseText.match(/89/)) {
          this._startAuthentication();
        }
      });
  }

  // Clear user credentials.
  logout() {
    this._clearCredentials();
  }

  /* Private methods */

  // Retrieve one or several values in the extension local storage.
  // Returns a promise that will resolve when done.
  _chromeLocalStorageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (results) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
        else { resolve(results); }
      });
    });
  }

  // Store an object in the extension local storage.
  // Returns a promise that will resolve when done.
  _chromeLocalStorageSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); }
        else { resolve(); }
      });
    });
  }

  _setCredentials(credentials) {
    this.oauth_token        = credentials.oauth_token;
    this.oauth_token_secret = credentials.oauth_token_secret;
    this.screen_name        = credentials.screen_name;
    return this._chromeLocalStorageSet({
      'oauth_token':        credentials.oauth_token,
      'oauth_token_secret': credentials.oauth_token_secret,
      'screen_name':        credentials.screen_name
    });
  }

  _fetchStoredCredentials() {
    return this._chromeLocalStorageGet(['oauth_token', 'oauth_token_secret', 'screen_name']);
  }

  _clearCredentials() {
    this.oauth_token        = null;
    this.oauth_token_secret = null;
    this.screen_name        = null;
    chrome.storage.local.remove(['oauth_token', 'oauth_token_secret', 'screen_name']);
  }

  // Convert a query string into an key-value object
  _deparam(responseText) {
    let obj = {};
    responseText.split('&').forEach((param) => {
      let pair = param.split('=');
      obj[pair[0]] = pair[1];
    });
    return obj;
  }

  _startAuthentication() {
    this._clearCredentials();

    return this.api('oauth/request_token', 'POST')
    .then(response => response.text())
    .then((responseText) => {
      // Extract request tokens
      var params = this._deparam(responseText);
      this._setCredentials({
        'oauth_token':        params.oauth_token,
        'oauth_token_secret': params.oauth_token_secret,
        'screen_name':        'foo' // FIXME
      });
      // Open a pop-up window to start the OAuth flow
      var url = 'https://api.twitter.com/oauth/authenticate?oauth_token=' + this.oauth_token;
      window.open(url);
      // Listen for messages sent by the background page
      chrome.runtime.onMessage.addListener(this._didReceiveMessage.bind(this));
      // Return a promise that will be resolved (or rejected) when the callback URL is called
      let oauthPromise = new Promise((resolve, reject) => {
        this.resolveAuthentication = resolve;
        this.rejectAuthentication = reject;
      });
      return oauthPromise;
    });
  }

  _sendMessageToContentPage(messageObject) {
    chrome.tabs.query({ currentWindow: true }, function(tabs) {
      console.debug(`Sending message to tab ${tabs[0].id}`);
      chrome.tabs.sendMessage(tabs[0].id, messageObject, function() {});
    });
  }

  _didReceiveMessage(request, sender, sendResponse) {
    console.debug("Received message: " + JSON.stringify(request));
    
    if (request.authState == 'success') {
      this.loadCredentials()
      .catch(error => this.rejectAuthentication(error))
      .then((screen_name) => {
        this.resolveAuthentication(screen_name);
        this.resolveAuthentication = null;
        this.rejectAuthentication = null;
      });

    } else if (request.authState == 'failure') {
      this.rejectAuthentication(request.error);
      this.resolveAuthentication = null;
      this.rejectAuthentication = null;
    }
  }
}
