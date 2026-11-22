/* Side panel: the Details tab, the filing details for the current transaction. */
(function () {
  'use strict';
  const P = globalThis.Panel;
  const h = P.h;

  function render() {
    const transaction = globalThis.OakSchemas.get(P.state.transaction);
    const values = P.currentDetails();
    const form = P.$('details-form');
    form.replaceChildren(
      ...transaction.fields.map((field) => {
        const id = 'detail-' + field.key;
        const listId = field.suggestions ? id + '-options' : null;
        return h(
          'label',
          { for: id },
          field.label,
          h('input', {
            id,
            name: field.key,
            type: field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text',
            list: listId,
            autocomplete: 'off',
            value: values[field.key] || '',
            oninput: save,
          }),
          listId ? h('datalist', { id: listId }, field.suggestions.map((option) => h('option', { value: option }))) : null,
        );
      }),
    );
    P.say('details-title', transaction.title);
  }

  async function save() {
    const values = {};
    new FormData(P.$('details-form')).forEach((value, key) => {
      const text = String(value).trim();
      if (text) values[key] = text;
    });
    await P.setDetails(values);
    P.say('details-status', Object.keys(values).length + ' details entered. Kept only until the browser closes.');
  }

  async function clear() {
    if (!window.confirm('Clear the filing details?')) return;
    await P.setDetails({});
    render();
    P.say('details-status', 'Cleared.');
  }

  P.details = { render };
  P.on('ready', () => {
    render();
    P.$('details-clear').addEventListener('click', clear);
  });
})();
