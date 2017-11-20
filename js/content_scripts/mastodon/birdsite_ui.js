const UIState = {
  SIGNED_OUT: 'signed-out',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  POSTING: 'posting',
  SUCCESS: 'success',
  FAILURE: 'failure'
};

// A stateless component that manages the extra UI injected into Mastodon compose form.
//
// The component accept a model object, which contains all the
// state needed for rendering.
//
// Usage:
//   let ui = new BirdSiteUI(document.querySelector('.compose-form'), {
//     toggle: toggleCheckbox,
//     send: sendTweet
//   });
class BirdSiteUI {
  // Initialize the component.
  // 
  // - composeForm: a node of the Mastodon compose form in which the extra UI should be injected
  // - actions: an object containing two functions called when the associated action is sent:
  //   - toggle(checked):  sent when the checkbox is checked or unchecked
  //   - change(text):     sent when the toot text changes
  //   - send(message):    sent when the "Toot" button is clicked
  //   - logout():         sent when the Logout control is clicked
  constructor(composeForm, { toggle, change, send, logout }) {
    this.composeForm = composeForm;
    this.actions = { toggle, change, send, logout };

    let tootButton = this.composeForm.querySelector('.compose-form__publish button');
    tootButton.addEventListener('click', this._tootButtonClicked.bind(this));

    let textarea = this.composeForm.querySelector('textarea');
    textarea.addEventListener('input', this._textareaChanged.bind(this));
    textarea.addEventListener('paste', this._textareaChanged.bind(this));
  }

  // Create or update the UI in the compose form from the given model.
  render(model) {
    let state = {
      step:            model.uiState,
      username:        model.username,
      checked:         model.checked,
      labelText:       null,
      labelTitle:      null,
      enabled:         false,
      identityVisible: false,
    };

    switch (state.step) {
      case UIState.SIGNED_OUT:
        state.labelText = chrome.i18n.getMessage("postOnTheBirdSite");
        state.labelTitle = '';
        state.identityVisible = false;
        state.enabled = true;
        break;
      case UIState.AUTHENTICATING:
        state.labelText = chrome.i18n.getMessage("authenticating");
        state.labelTitle = '';
        state.identityVisible = false;
        state.enabled = false;
        break;
      case UIState.READY:
        state.labelText = chrome.i18n.getMessage("postOnTheBirdSite");
        state.labelTitle = '';
        state.identityVisible = true;
        state.enabled = true;
        break;
      case UIState.POSTING:
        state.labelText = chrome.i18n.getMessage("postOnTheBirdSite");
        state.labelTitle = '';
        state.identityVisible = true;
        state.enabled = false;
        break;
      case UIState.SUCCESS:
        state.labelText = chrome.i18n.getMessage("postOnTheBirdSite");
        state.labelTitle = '';
        state.identityVisible = true;
        state.enabled = true;
        break;
      case UIState.FAILURE:
        state.labelText = chrome.i18n.getMessage("anErrorOccured");
        state.labelTitle = model.errorMessage;
        state.identityVisible = false;
        state.enabled = true;
        break;
      default:
        throw new Error(`Unknow model.uiState '#{model.uiState}'`);
        break;
    }

    // Render the component
    // (Yes, we do render it from scratch on every change. But the HTML is quite small,
    // and the state doesn't change often: performance is fine, and we don't need
    // a virtual DOM for this.)
    let html = `
      <div class="birdsite birdsite--${state.step} ${state.checked ? 'birdsite--checked' : ''}">
        <input class="birdsite__checkbox" id="birdsite-checkbox" type="checkbox" ${state.checked ? 'checked' : ''} ${state.enabled ? '' : 'disabled'}>
        <label class="birdsite__label" for="birdsite-checkbox" title="${state.labelTitle}">
          <span class="birdsite__label-text">
            ${state.labelText}
          </span>
          <span class="birdsite__identity">
            <a class="birdsite__username" data-username="${state.username}" title="${chrome.i18n.getMessage('clickToLogout')}">
              @${state.username}  
            </a>
          </span>
          <span class="birdsite__status"></span>
        </label>
      </div>`;

    let form = this.composeForm;
    let rootElement = form.querySelector('.birdsite');
    if (rootElement) {
      form.removeChild(rootElement);
    }
    form.insertAdjacentHTML('beforeend', html);
    form.querySelector('.birdsite__checkbox').addEventListener('change', this._checkboxChanged.bind(this));
    form.querySelector('.birdsite__username').addEventListener('click', this._logoutClicked.bind(this));
  }

  _textareaChanged(event) {
    let textarea = event.target;
    let toot = textarea.value;
    this.actions.change(toot);
  }

  _checkboxChanged(event) {
    let checkbox = event.target;
    this.actions.toggle(checkbox.checked);
  }

  _tootButtonClicked() {
    let checkbox = this.composeForm.querySelector('.birdsite__checkbox');
    if (checkbox.checked) {
      let textarea = this.composeForm.querySelector('textarea');
      let toot = textarea.value;
      if (toot.length > 0) {
        this.actions.send(toot);
      }
    }
  }

  _logoutClicked(event) {
    let logoutLink = event.target,
        username = logoutLink.getAttribute('data-username');
    if (window.confirm(chrome.i18n.getMessage('confirmLogout', username))) {
      this.actions.logout();
    }
    event.preventDefault();
  }
}
