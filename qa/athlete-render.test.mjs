import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const renderAthleteView = require('../js/athlete-render.js');

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.innerHTMLWrites = [];
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  set innerHTML(value) {
    this.innerHTMLWrites.push(value);
  }
}

class FakeDocument {
  createElement() {
    return new FakeElement(this);
  }
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

test('hostile published athlete text stays in text nodes', () => {
  const document = new FakeDocument();
  const view = new FakeElement(document);
  const hostile = '<img src=x onerror="globalThis.pwned=true"><script>globalThis.pwned=true</script>';

  renderAthleteView(view, {
    date: '2026-10-15',
    coachPreview: true,
    session: {
      practiceStatus: 'water',
      title: hostile,
      intent: hostile,
      workout: hostile,
      cue: hostile,
    },
  }, null);

  const nodes = descendants(view);
  assert.ok(nodes.some(node => node.textContent === hostile));
  assert.deepEqual(nodes.flatMap(node => node.innerHTMLWrites), []);
  assert.equal(globalThis.pwned, undefined);
});
