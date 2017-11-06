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
  //   - toggle(checked): sent when the checkbox is checked or unchecked
  //   - send(message):   sent when the "Toot" button is clicked
  //   - logout():        sent when the Logout control is clicked
  constructor(composeForm, actions) {
    this.composeForm = composeForm;
    this.actions = actions;

    let tootButton = this.composeForm.querySelector('.compose-form__publish button');
    tootButton.addEventListener('click', this._tootButtonClicked.bind(this));
  }

  // Create or update the UI in the compose form from the given model.
  render(model) {
    let state = {
      step:            model.uiState,
      username:        model.username,
      checked:         model.checked,
      labelText:       null,
      enabled:         false,
      identityVisible: false,
    };

    switch (state.step) {
      case UIState.SIGNED_OUT:
        state.labelText = "Post on the bird site";
        state.identityVisible = false;
        state.enabled = true;
        break;
      case UIState.AUTHENTICATING:
        state.labelText = "Authenticating";
        state.identityVisible = false;
        state.enabled = false;
        break;
      case UIState.READY:
        state.labelText = "Post on the bird site";
        state.identityVisible = true;
        state.enabled = true;
        break;
      case UIState.POSTING:
        state.labelText = "Post on the bird site";
        state.identityVisible = true;
        state.enabled = false;
        break;
      case UIState.SUCCESS:
        state.labelText = "Post on the bird site";
        state.identityVisible = true;
        state.enabled = true;
        break;
      case UIState.FAILURE:
        state.labelText = "An error occured while posting to the bird site";
        state.identityVisible = false;
        state.enabled = true;
        break;
      default:
        throw new Error(`Unknow model.uiState '#{model.uiState}'`);
        break;
    }

    // Render the component
    // (Yes, we do render it from scratch on every change. But the HTML is quite small,
    // and the state doesn't change often: the performances are fine, and we don't need
    // a virtual DOM for this.)
    let html = `
      <div class="birdsite">
        <label class="birdsite__crosspost">
          <input class="birdsite__crosspost-checkbox" type="checkbox" ${state.checked ? 'checked' : ''} ${state.enabled ? '' : 'disabled'}>
          <span class="birdsite__label-text">
            ${state.labelText}
          </span>
        </label>
        <span class="birdsite__identity" style="display: ${state.identityVisible ? 'initial' : 'none'};">
          as
          <a class="birdsite__username" data-username="${state.username}" title="Click to logout from the bird site">
            @${state.username}
          </a>
        </span>
        <span class="birdsite__status birdsite__status--${state.step}"></span>
      </div>`;

    let form = this.composeForm;
    let rootElement = form.querySelector('.birdsite');
    if (rootElement) {
      form.removeChild(rootElement);
    }
    form.insertAdjacentHTML('beforeend', html);
    form.querySelector('.birdsite__crosspost-checkbox').addEventListener('change', this._checkboxChanged.bind(this));
    form.querySelector('.birdsite__identity').addEventListener('click', this._logoutClicked.bind(this));
  }

  _checkboxChanged(event) {
    let checkbox = event.target;
    this.actions.toggle(checkbox.checked);
  }

  _tootButtonClicked() {
    let checkbox = document.querySelector('.compose-form .birdsite__crosspost-checkbox');
    if (checkbox.checked) {
      let textarea = document.querySelector('.compose-form textarea');
      let toot = textarea.value;
      if (toot.length > 0) {
        this.actions.send(toot);
      }
    }
  }

  _logoutClicked(event) {
    let checkbox = event.target,
        username = checkbox.getAttribute('data-username');
    if (window.confirm(`Do you want to disconnect from the @${username} bird site account?`)) {
      this.actions.logout();
    }
  }
}
