const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadApp(savedState) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!error.message.includes('Could not load')) throw error;
  });

  return new JSDOM(html, {
    url: 'https://example.test/',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.structuredClone = global.structuredClone;
      window.alert = () => {};
      window.confirm = () => true;
      if (savedState) {
        window.localStorage.setItem('jimny-build-v2', JSON.stringify(savedState));
      }
    }
  });
}

test('old saved mods gain an empty imageUrl without losing their data', () => {
  const oldMod = {
    id: 'legacy',
    name: 'Legacy grille',
    category: 'Exterior',
    price: 1200,
    status: 'Wishlist',
    notes: 'keep me',
    description: 'Existing description'
  };
  const dom = loadApp({ mods: [oldMod], builds: [] });

  assert.deepEqual(
    JSON.parse(JSON.stringify(dom.window.jimnyApp.getState().mods[0])),
    { ...oldMod, imageUrl: '' }
  );
});

test('editor starts with collapsed category groups and collapsed mod editors', () => {
  const dom = loadApp();
  const document = dom.window.document;
  const categories = [...document.querySelectorAll('#editMods details.category-editor')];
  const mods = [...document.querySelectorAll('#editMods details.mod-editor')];

  assert.ok(categories.length > 1);
  assert.equal(mods.length, dom.window.jimnyApp.getState().mods.length);
  assert.ok(categories.every(group => !group.open));
  assert.ok(mods.every(mod => !mod.open));
});

test('a mod with an image URL renders thumbnails in the configurator and editor', () => {
  const dom = loadApp();
  const state = dom.window.jimnyApp.getState();
  state.mods[0].imageUrl = 'https://images.example.test/wheel.jpg';
  dom.window.jimnyApp.setState(state);

  assert.equal(dom.window.document.querySelector('#catalog img.mod-thumb').src, 'https://images.example.test/wheel.jpg');
  assert.equal(dom.window.document.querySelector('#editMods img.editor-thumb').src, 'https://images.example.test/wheel.jpg');
});

test('new mods save both description and image URL', () => {
  const dom = loadApp();
  const document = dom.window.document;
  document.getElementById('newName').value = 'Steel grille';
  document.getElementById('newDescription').value = 'Powder-coated replacement grille';
  document.getElementById('newImageUrl').value = 'https://images.example.test/grille.jpg';
  document.getElementById('addMod').click();

  const added = dom.window.jimnyApp.getState().mods.at(-1);
  assert.equal(added.description, 'Powder-coated replacement grille');
  assert.equal(added.imageUrl, 'https://images.example.test/grille.jpg');
});

test('only web image URLs render as thumbnails', () => {
  const dom = loadApp();
  const state = dom.window.jimnyApp.getState();
  state.mods[0].imageUrl = 'https://images.example.test/safe.jpg';
  state.mods[1].imageUrl = 'javascript:alert(1)';
  dom.window.jimnyApp.setState(state);

  assert.equal(dom.window.document.querySelectorAll('#catalog img.mod-thumb').length, 1);
  assert.equal(dom.window.document.querySelectorAll('#editMods img.editor-thumb').length, 1);
  assert.equal(dom.window.document.querySelector('[data-mod-id="m1"] img'), null);
});

test('configurator text can shrink and wrap inside a narrow row', () => {
  const dom = loadApp();
  const state = dom.window.jimnyApp.getState();
  state.mods[0].name = 'An-unusually-long-unbroken-modification-name-for-a-phone';
  state.mods[0].description = 'https://example.test/an/unusually/long/unbroken/product/path';
  state.mods[0].imageUrl = 'https://images.example.test/mod.jpg';
  dom.window.jimnyApp.setState(state);

  const content = dom.window.document.querySelector('#catalog .mod-content');
  assert.ok(content, 'the row needs a dedicated flexible text column');
  const style = dom.window.getComputedStyle(content);
  assert.equal(style.minWidth, '0');
  assert.equal(style.overflowWrap, 'anywhere');
});
