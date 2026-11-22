/*
 * OakCloud Filing Assistant: filing-details schemas, one per Bizfile transaction.
 * Defines globalThis.OakSchemas.
 *
 * type: text | date (stored YYYY-MM-DD) | choice (free text with suggestions; the screen map
 * records how each value appears on Bizfile) | phone | email.
 * Suggestions are hints only; the text Bizfile shows is learned from the screen.
 */
(function (root) {
  'use strict';

  const TRANSACTIONS = {
    'appoint-position-holder': {
      id: 'appoint-position-holder',
      title: 'Appoint position holder (individual)',
      bizfilePath: '/registry/update-personnel/appoint-withdraw-position-holder-form',
      fields: [
        { key: 'category', label: 'Category', type: 'choice', suggestions: ['Individual', 'Corporate'] },
        { key: 'position', label: 'Position held', type: 'choice', suggestions: ['Director', 'Secretary', 'Chief Executive Officer', 'Managing Director', 'Alternate Director'] },
        { key: 'appointmentDate', label: 'Date of appointment', type: 'date' },
        { key: 'idType', label: 'Identification type', type: 'choice', suggestions: ['NRIC (Citizen)', 'NRIC (PR)', 'FIN', 'Passport'] },
        { key: 'idNumber', label: 'Identification number', type: 'text' },
        { key: 'name', label: 'Name (as per identification document)', type: 'text' },
        { key: 'nationality', label: 'Nationality', type: 'choice', suggestions: ['Singapore Citizen', 'Malaysian', 'British'] },
        { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
        { key: 'addressType', label: 'Address type', type: 'choice', suggestions: ['Local', 'Foreign'] },
        { key: 'postalCode', label: 'Postal code', type: 'text' },
        { key: 'block', label: 'Block / house number', type: 'text' },
        { key: 'street', label: 'Street name', type: 'text' },
        { key: 'unit', label: 'Level and unit', type: 'text' },
        { key: 'building', label: 'Building name', type: 'text' },
        { key: 'foreignAddress1', label: 'Foreign address line 1', type: 'text' },
        { key: 'foreignAddress2', label: 'Foreign address line 2', type: 'text' },
        { key: 'email', label: 'Email address', type: 'email' },
        { key: 'mobile', label: 'Mobile number', type: 'phone' },
      ],
    },
  };

  function get(id) {
    return TRANSACTIONS[id] || null;
  }

  function field(transactionId, key) {
    const transaction = get(transactionId);
    return transaction ? transaction.fields.find((item) => item.key === key) || null : null;
  }

  /** The schema without values, as sent to AI: keys, labels, types and suggestions only. */
  function targets(transactionId) {
    const transaction = get(transactionId);
    if (!transaction) return [];
    return transaction.fields.map(({ key, label, type, suggestions }) => ({ key, label, type, ...(suggestions ? { options: suggestions } : {}) }));
  }

  root.OakSchemas = { TRANSACTIONS, get, field, targets, list: () => Object.values(TRANSACTIONS) };
})(globalThis);
