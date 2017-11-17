/* MIT License
 * 
 * Copyright (c) 2017 Andy Jiang, Pierre de La Morinerie
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const TWITTER_API_URL         = 'https://api.twitter.com/';
const TWITTER_UPLOAD_URL      = 'https://upload.twitter.com/';
const TWITTER_CONSUMER_KEY    = '9Y6TkkJkq65aBTi07ozaNYgP7';
const TWITTER_CONSUMER_SECRET = 'NhVLcbe4WD2rGUHxRUsdhCvLFIkjqWHqrkFIIYQ0sXV5Zo4R7w';

// Manage the authentication flow and authenticated requests
// against the Twitter API.
//
// Usage:
//   let client = new TwitterClient();
//   let username = await client.loadCredentials();
//   if (!username) {
//     username = await client.authenticate();
//   }
//   await client.sendTweet('Tweet!');
class TwitterClient {
  constructor() {
    this.api_url         = TWITTER_API_URL;
    this.upload_url      = TWITTER_UPLOAD_URL;
    this.consumer_key    = TWITTER_CONSUMER_KEY;
    this.consumer_secret = TWITTER_CONSUMER_SECRET;
    this.credentials = new TwitterCredentials();

    this.resolveAuthentication = null;
    this.rejectAuthentication = null;
  }

  // Initialize the client by loading saved Twitter credentials.
  // Returns a promise that will be resolved with the Twitter username if credentials are found,
  // and `null` otherwise.
  async loadCredentials() {
    let credentials = await TwitterCredentials.load();
    if (credentials) {
      this.credentials = credentials;
      return credentials.screen_name;

    } else {
      return null;
    }
  }

  // Start the OAuth flow, and return a promise that will resolve at the end of the flow.
  async authenticate() {
    await this._clearCredentials();

    let response = await this.api('oauth/request_token', 'POST'),
        responseText = await response.text(),
        responseParams = this._extractParameters(responseText);

    // Extract request token
    let credentials = new TwitterCredentials(responseParams);

    // Open a pop-up window to start the OAuth flow
    var url = 'https://api.twitter.com/oauth/authenticate?oauth_token=' + credentials.oauth_token;
    window.open(url);

    // Listen for messages sent by the background page
    chrome.runtime.onMessage.addListener(this._didReceiveMessage.bind(this));

    // Return a promise that will be resolved (or rejected) when the callback URL is called
    let oauthPromise = new Promise((resolve, reject) => {
      this.resolveAuthentication = resolve;
      this.rejectAuthentication = reject;
    });
    return oauthPromise;
  }

  // Finish the last authentication step, by providing the query parameters
  // sent by Twitter to the callback pop-up page.
  //
  // This method is intended to be called from the background extension page.
  // It will send a message to the content page, in order to resolves (or reject)
  // the promise returned by `authenticate`.
  async completeAuthentication(queryParams) {
    var params = this._extractParameters(queryParams);

    try {
      let response = await this.api('oauth/access_token', 'POST', params),
          responseText = await response.text(),
          responseParams = this._extractParameters(responseText);

      this.credentials = new TwitterCredentials(responseParams);
      await this.credentials.save();
      this._sendMessageToContentPage({ authState: 'success' });
      
    } catch(error) {
      this._sendMessageToContentPage({ authState: 'failure', error: error });
    }
  }

  // Send a request to the Twitter API.
  // Returns a promise that resolves when the request finishes.
  async api(path, method = 'GET', params = {}) {
    // Figure out API host
    let baseUrl = path.match(/upload/) ? this.upload_url : this.api_url;
    // Adjust API path (if this is not an authentication request)
    if (!path.match(/oauth/)) {
      path = '1.1/' + path + '.json';
    }

    // Feed the parameters into the OAuth helper
    let url = baseUrl + path;
    let message = {
      action:     url,
      method:     method,
      parameters: params
    };
    OAuth.completeRequest(message, this._defaultOAuthCredentials(this.credentials));

    // Retrieve properly formatted parameters suitable for inclusion in the HTTP request
    // from the OAuth helper
    let requestParams = new URLSearchParams();
    Object.entries(OAuth.getParameterMap(message.parameters)).forEach(([key, value]) => {
      if (value == null) {
        value = '';
      }
      requestParams.append(key, value);
    });

    // Send request
    return fetch(url, { method: method, body: requestParams });
  }

  // Send a file upload request to the Twitter API.
  // Returns a promise that resolves when the request finishes.
  async uploadMedia(mediaUrl) {
    // Retrieve the media file from the external URL
    let mediaFile = await fetch(mediaUrl);
    let mediaArrayBuffer = await mediaFile.arrayBuffer();
    let mediaBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(mediaArrayBuffer)));
    // Send the media blob to Twitter
    let response = await this.api('media/upload', 'POST', {
      media_data: mediaBase64
    });

    if (response.ok) {
      return response;
    } else {
      let responseText = await response.text();
      throw new Error(`[TwitterClient] media upload failed (${responseText})`);
    }
  }

  // Use the Twitter API to post a new tweet.
  // The text will be truncated to the maximum length if needed.
  // Usage: twitterClient.postTweet(new Tweet('My status'));
  async sendTweet(tweet) {
    let mediaIds = [];
    if (tweet.medias.length > 0) {
      let uploads = tweet.medias.map(media => this.uploadMedia(media.url));
      let mediaResponses = await Promise.all(uploads);
      let responsesJson = await Promise.all(mediaResponses.map(response => response.json()));
      mediaIds = responsesJson.map(responseJson => responseJson['media_id_string']);
    }

    let response = await this.api('statuses/update', 'POST', {
      status: tweet.truncatedText(),
      media_ids: mediaIds.join(',')
    });

    if (response.ok) {
      return response;
    } else {
      let responseText = await response.text();
      throw new Error(`[TwitterClient] tweet posting failed (${responseText})`);
    }
  }

  // Clear user credentials.
  // Returns a promise that will resolve then the credentials have been removed from the persistent store
  async logout() {
    await this._clearCredentials();
  }

  /* Private methods */

  // Returns an object containing OAuth credentials,
  // which can be used as the `accessor` argument of `OAuth.completeRequest`.
  // 
  // OAuth credentials can still be overriden at the request level.
  _defaultOAuthCredentials(credentials) {
    return {
      consumerKey:    this.consumer_key,
      consumerSecret: this.consumer_secret,
      token:          credentials.oauth_token,
      tokenSecret:    credentials.oauth_token_secret
    };
  }

  async _clearCredentials() {
    this.credentials = new TwitterCredentials();
    await this.credentials.save();
  }

  // Convert a query string into an key-value object
  _extractParameters(responseText) {
    let result = {};
    responseText.split('&').forEach((param) => {
      let pair = param.split('=');
      result[pair[0]] = pair[1];
    });
    return result;
  }

  _sendMessageToContentPage(messageObject) {
    chrome.tabs.query({}, function(tabs) {
      for (let tab of tabs) {
        console.debug(`Sending message to tab ${tab.id}`);
        chrome.tabs.sendMessage(tab.id, messageObject, function() {});
      }
    });
  }

  async _didReceiveMessage(request, sender, sendResponse) {
    console.debug("Received message: " + JSON.stringify(request));
    
    if (request.authState == 'success') {
      let screen_name;
      try {
        screen_name = await this.loadCredentials();
      } catch (error) {
        this.rejectAuthentication(error);
      }
      this.resolveAuthentication(screen_name);

    } else if (request.authState == 'failure') {
      this.rejectAuthentication(request.error);
    }

    this.resolveAuthentication = null;
    this.rejectAuthentication = null;
  }
}

// Represent a tweet to be posted.
// Uses twitter-text.js (aliased as window.twttr)
class Tweet {
  get MAX_TWEET_LENGTH() { return 260; }

  constructor(text) {
    this.text = text;
    this.externalUrl = null;
    this.medias = [];
    this.twitterText = window.twttr.txt;
  }

  // Set an URL to the full content, which will be added if the tweet needs to be truncated.
  setExternalUrl(url) {
    this.externalUrl = url;
  }

  addMedia(url, type) {
    this.medias.push({ url, type });
  }

  hasPattern(regexp) {
    return !!this.text.match();
  }

  deletePattern(regexp) {
    this.text = this.text.replace(regexp, '');
  }

  needsTruncation() {
    return this.twitterText.getTweetLength(this.text) > this.MAX_TWEET_LENGTH;
  }

  // Truncate the text to a size fitting in a tweet.
  //
  // When the text is already short enough, the full text is used.
  // But when the text needs to be truncated, an external URL to the full content is appended (if provided).
  truncatedText() {
    let text = this.text;

    if (! this.needsTruncation()) {
      return text;

    } else {
      let suffix = '…' + (this.externalUrl ? ` ${this.externalUrl}` : ''),
          truncatedText = text;
      for (let length = text.length; this.twitterText.getTweetLength(truncatedText) >= this.MAX_TWEET_LENGTH; length--) {
        truncatedText = text.slice(0, length) + suffix;
      }
      return truncatedText;
    }
  }

}

// Represents, save and retrieve Twitter user credentials from local storage.
// For internal use only.
class TwitterCredentials {
  constructor(credentials) {
    credentials = credentials || {};

    this.oauth_token = credentials.oauth_token || null;
    this.oauth_token_secret = credentials.oauth_token_secret || null;
    this.screen_name = credentials.screen_name || null;
  }

  static async load() {
    let results = await _toPromise(chrome.storage.local.get)(['oauth_token', 'oauth_token_secret', 'screen_name']);
    let isValid = results.oauth_token && results.oauth_token_secret && results.screen_name;
    if (isValid) {
      return new TwitterCredentials(results);
    } else {
      return null;
    }
  }

  async save() {
    await _toPromise(chrome.storage.local.set)({
      oauth_token:        this.oauth_token,
      oauth_token_secret: this.oauth_token_secret,
      screen_name:        this.screen_name
    });
  }
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
