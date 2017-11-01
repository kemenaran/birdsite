var birdSiteUI,
    store;

detect();

/** Store *********************************/

const TwitterState = {
  SIGNED_OUT: 'signed-out',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  POSTING: 'posting',
  SUCCESS: 'success',
  FAILURE: 'failure'
};

class BirdSiteStore {
  constructor() {
    this.state = {
      twitterState: TwitterState.SIGNED_OUT,
      username:     null,
      checked:      false
    };
  }

  transitionToSignedIn(username) {
    this.state.twitterState = TwitterState.READY;
    this.state.username = username;
  }

  transitionToSignedOut() {
    this.state.twitterState = TwitterState.SIGNED_OUT;
    this.state.username = null;
  }

  transitionToPosting() {
    this.state.twitterState = TwitterState.POSTING;
    this.state.checked = true;
  }

  transitionToSuccess() {
    this.state.twitterState = TwitterState.SUCCESS;
    this.state.checked = false;
  }

  transitionToFailure() {
    this.state.twitterState = TwitterState.FAILURE;
    this.state.checked = false;
  }

  toggleChecked(isChecked) {
    this.state.checked = !!isChecked;
    if (this.state.twitterState == TwitterState.SUCCESS || this.state.twitterState == TwitterState.FAILURE) {
      this.transitionToSignedIn(this.store.username);
    }
  }
}

/* UI component ***********************************/

class BirdSiteUI {
  // Inject a "Post to the bird site" checkbox under Mastodon compose form
  injectUI(store) {
    let composeForm = document.querySelector('div#mastodon .compose-form');
    if (!composeForm || composeForm.querySelector('.tooter')) { 
      return;
    }

    let tooterContainer = document.createElement('div');
    tooterContainer.setAttribute('class', 'tooter');
    composeForm.appendChild(tooterContainer);

    let label = document.createElement('label');
    label.setAttribute('class', 'tooter__crosspost');
    tooterContainer.appendChild(label);

    let checkbox = document.createElement('input');
    checkbox.setAttribute('class', 'tooter__crosspost-checkbox');
    checkbox.setAttribute('name', 'tooter-crosspost-checkbox');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.addEventListener('change', didClickCrosspostCheckbox);
    label.appendChild(checkbox);

    let labelText = document.createElement('span');
    labelText.setAttribute('class', 'tooter__label-text');
    label.appendChild(labelText);

    let identity = document.createElement('a');
    identity.setAttribute('class', 'tooter__identity');
    identity.setAttribute('href', '#');
    identity.setAttribute('title', 'Click to logout from the bird site');
    identity.textContent = " (as @username)"
    identity.addEventListener('click', logoutAction);
    tooterContainer.appendChild(identity);

    // Add an additional click event on the "Toot!" button
    let tootButton = composeForm.querySelector('.compose-form__publish button');
    tootButton.addEventListener('click', didClickTootButton);

    updateState(store);
  }

  // Update the UI according to the current state
  updateState(store) {
    let state = store.state;
    let internalState = {
      rootClass: '.tooter--' + state.twitterState,
      username: state.username,

      labelText: null,
      enabled: false,
      identityVisible: false,
    };

    switch (state.twitterState) {
      case TwitterState.SIGNED_OUT:
        internalState.labelText = "Also post on bird site";
        internalState.identityVisible = false;
        internalState.enabled = true;
        break;
      case TwitterState.AUTHENTICATING:
        internalState.labelText = "Authenticating…";
        internalState.identityVisible = false;
        internalState.enabled = false;
        break;
      case TwitterState.READY:
        internalState.labelText = "Also post on bird site";
        internalState.identityVisible = true;
        internalState.enabled = true;
        break;
      case TwitterState.POSTING:
        internalState.labelText = "Also post on bird site…";
        internalState.identityVisible = true;
        internalState.enabled = false;
        break;
      case TwitterState.SUCCESS:
        internalState.labelText = "Also post on bird site";
        internalState.identityVisible = true;
        internalState.enabled = false;
        break;
      case TwitterState.FAILURE:
        internalState.labelText = "An error occured while posting to the bird site";
        internalState.identityVisible = true;
        internalState.enabled = true;
        break;
    }

    // Apply internal state
    let rootDiv = document.querySelector('.compose-form .tooter');

    let rootClass = rootDiv.className;
    rootClass.replace(/.tooter--[^ ]*/, '');
    rootClass += internalState.rootClass;
    rootDiv.className = rootClass;

    if (internalState.enabled) {
      rootDiv.removeAttribute('disabled');
    } else {
      rootDiv.setAttribute('disabled', '');
    }

    let labelText = rootDiv.querySelector('.tooter__label-text');
    labelText.textContent = internalState.labelText;

    let identity = rootDiv.querySelector('.tooter__identity'),
        identityText = internalState.username ? ` (as @#{internalState.username})` : '',
        visibility = internalState.identityVisible ? 'visible' : 'hidden';
    identity.textContent = identityText;
    identity.style.visibility = visibility;
  }
}

/** Injected extension code **********************************/

function detect() {
  // Discard non-mastodon web app early
  let mastodonWebAppRoot = document.querySelector('.app-holder#mastodon');
  if (!mastodonWebAppRoot) {
    return;
  }

  let mastodonComposeForm = document.querySelector('div#mastodon .compose-form');
  if (mastodonComposeForm) {
    inject();

  } else {
    // Set up a mutation observer, to detect when the compose form may be visible.
    //
    // To make the observer as lightweight as possible, instead of observing every
    // mutation of the whole DOM tree, we only look for the `is-composing` class
    // added to a root div when the compose form gains focus.
    //
    // See https://stackoverflow.com/questions/31659567/performance-of-mutationobserver-to-detect-nodes-in-entire-dom
    
    debugMessage('Mastodon web root detected: setting up a mutation observer.');
    let uiContainer = mastodonWebAppRoot.querySelector('div.ui');
    let observer = new MutationObserver(function (/* mutations */) {
      debugMessage('Mutation observed: detecting ".ui.is-composing".');
      let isComposeFormFocused = uiContainer.classList.contains('is-composing');
      if (isComposeFormFocused) {
        inject();
        // When displaying the mobile web UI, the compose form may be removed and
        // then made visible again.
        // Keep the observer active, so that we can re-attach our custom UI
        // if this happens.
      }
    });
    observer.observe(uiContainer, { attributes: true, attributeFilter: ['class'] });
  }
}

function inject() {
  debugMessage('Compose form detected: loading extension');
  let composeForm = document.querySelector('div#mastodon .compose-form');
  if (!composeForm) {
    console.warning('Couldn’t setup tooter extension for Mastodon web app Compose form: the compose form was not found.');
    return;
  }

  birdSiteUI = new BirdSiteUI();
  store = new BirdSiteStore();

  Twitter.loadCredentials()
  .then((credentials) => {
    store.transitionToSignedIn(credentials.username);
    birdSiteUI.injectUI(store.state);
  })
  .catch(() => {
    store.transitionToSignedOut();
    birdSiteUI.injectUI(store.state);
  });
}

/** Actions */

function didClickCrosspostCheckbox() {
  let crossPostCheckbox = document.querySelector('.tooter__crosspost-checkbox');
  store.toggleChecked(crossPostCheckbox.checked);
  birdSiteUI.updateState(store);
}

function didClickTootButton() {
  if (store.checked) {
    let textarea = document.querySelector('.compose-form textarea');
    let tootText = textarea.value;
    crossPostToTwitter(tootText);
  }
}

function crossPostToTwitter(message) {
  if (message.length == 0) {
    debug('Avoiding to post empty post to Twitter.');
    return;
  }

  Twitter.loadCredentials()
  .catch(() => {
    store.transitionToAuthenticating();
    birdSiteUI.updateState(store);
    return Twitter.requestAuthentication();
  })
  .then(() => {
    store.transitionToPosting();
    birdSiteUI.updateState(store);
    let params = { status: message };
    return Twitter.api('statuses/update', 'POST', params)
  })
  .then(() => {
    store.transitionToSuccess();
    birdSiteUI.updateState(store);
  })
  .catch((error) => {
    store.transitionToFailure();
    birdSiteUI.updateState(store);
    alert('An error occured while posting to Twitter: ' + error);
  });
}

function logoutAction() {
  Twitter.logout();
  store.transitionToSignedOut();
  birdSiteUI.updateState(store);
}

function debugMessage(message) {
  let debugEnabled = false; // set to true to enable debugging
  if (debugEnabled) {
    console.debug(message);
  }
}
