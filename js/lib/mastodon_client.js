// A very simple client to interact with Mastodon public API.
class MastodonClient {
  // Retrieve the Atom feed of an user public toots.
  // Returns an array of statuses.
  async fetchPublicStatuses(instanceDomain, username) {
    let atomFeedUrl = `https://${instanceDomain}/users/${username}.atom`;
    let response = await fetch(atomFeedUrl);
    let atomFeed = await response.text();

    let parser = new DOMParser();
    let atomDoc = parser.parseFromString(atomFeed, "text/xml");
    let entries = atomDoc.documentElement.querySelectorAll('entry');

    // Reconstruct objects like the `Status` API entity from the Atom entry
    let statuses = this._mapNodes(entries, entry => (
      {
        id:      entry.querySelector('id').textContent.split('/').pop(),
        url:     entry.querySelector('link[rel=alternate][type="text/html"]').getAttribute('href'),
        content: entry.querySelector('content').textContent,
        media_attachments: this._mapNodes(entry.querySelectorAll('link[rel=enclosure]'), link => (
          {
            url:       link.getAttribute('href'),
            mime_type: link.getAttribute('type')
          }
        ))
      }
    ));
    return statuses;
  }

  // Retrieve the public status for a given toot text, by scanning
  // the public Atom feed for items matching the text.
  //
  // Toots in the Atom feed (or Mastodon API) will be pre-rendered with some
  // HTML, so the function attempts to match toot words one-by-one.
  //
  // Returns a `Status` object with a structure similar to the Mastodon API.
  async fetchStatusForToot(instance, username, toot) {
    let delay = 2 * 1000; // delay between each attempt (2 seconds by default)
    let timeout = 30 * 1000; // time before giving up (60 seconds by default)

    let matchingStatus = null;
    let expirationTime = Date.now() + timeout;
    while (!matchingStatus || (Date.now() < expirationTime)) {
      let publicStatuses = await this.fetchPublicStatuses(instance, username);
      matchingStatus = publicStatuses.find(status => this._fuzzyMatches(toot, status.content));
      if (matchingStatus) {
        break;
      } else {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }

    if (matchingStatus) {
      return matchingStatus;
    } else {
      throw new Error("Couldn’t find a status for user '${username}' matching '${toot}'");
    }
  }

  /* Helpers *******************************/

  // Tells if an HTML-rendered toot matches the toot's raw text.
  // Example:
  //  _fuzzyMatch('Some toot', '<p>Some <span>toot</span></p>') -> true
  //  _fuzzyMatch('Some toot', '<p>Another <a href="#">text</a></p>') -> false
  _fuzzyMatches(rawToot, htmlToot) {
    let decodedHtmlToot = this._decodeHtmlEntities(htmlToot),
        escapedRawToot = rawToot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        words = escapedRawToot.match(/\b(\w+)\b/g),
        regex = new RegExp(words.join('.*'), 'i');
    return (decodedHtmlToot.match(regex) != null);
  }

  // Take a string with HTML entities, and return a string with the HTML entities decoded.
  _decodeHtmlEntities(encodedString) {
    let entities = {
      '&amp;':  '&',
      '&gt;':   '>',
      '&lt;':   '<',
      '&quot;': '"',
      '&apos;': "'"
    };

    let decodedString = encodedString;
    Object.entries(entities).forEach(([key, value]) => {
      decodedString = decodedString.replace(new RegExp(key, 'g'), value);
    });
    return decodedString;
  }

  // Allow using `map` on a NodeList
  _mapNodes(nodeList, callback) {
    return Array.prototype.map.call(nodeList, callback);
  }
}

