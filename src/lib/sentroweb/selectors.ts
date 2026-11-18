/**
 * Every Sentroweb path, selector, label text, modal text and pattern the browser client relies
 * on. This is the ONE place to fix when Sentroweb changes its pages: no selector literal may
 * appear anywhere else (a test enforces this). Source: the discovery notes in
 * docs/features/SENTROWEB_CHECK.md (login, search form, confirm modal, result, export).
 *
 * The Sentroweb site is a React single-page app built with Semantic UI.
 */

export const SENTROWEB_PATHS = {
  login: '/SentroWeb/login',
  search: '/SentroWeb/main?tab=search',
  /** URL path prefix that proves the browser is signed in (landing page after login). */
  mainPrefix: '/SentroWeb/main',
  /** URL path prefix of the login page. */
  loginPrefix: '/SentroWeb/login',
} as const;

/** XHR endpoints the client reads passively (it never calls them itself). */
export const SENTROWEB_XHR = {
  authenticate: '/sentroweb-service/auth/private/authenticate',
  checkQuota: '/sentroweb-service/account/private/checkquota',
  search: '/sentroweb-service/screening/private/search',
} as const;

export const SENTROWEB_SELECTORS = {
  login: {
    accountId: 'input[name="accountId"]',
    username: 'input[name="username"]',
    password: 'input[name="password"]',
    submit: 'button',
  },
  menu: {
    /** The hamburger icon in the page header. */
    toggle: '.bars.icon',
    /** Menu items are matched by their visible text. */
    itemSelector: '.menu .item, .ui.menu a, .ui.dropdown .item, .item',
    logoutText: 'Logout',
  },
  search: {
    nameInput: 'form input[placeholder="Search name"]',
    /** Semantic UI checkbox wrappers; each holds one label and one hidden, read-only input. */
    checkbox: 'form .checkbox',
    checkboxLabel: 'label',
    /** The hidden input never changes: a ticked box is shown by this class on the wrapper. */
    checkboxCheckedClass: 'checked',
    individualLabelText: 'Individual',
    entityLabelText: 'Entity',
    fuzzyLabelText: 'Fuzzy Search',
    submit: 'form button.search-button',
    /** The submit button stays disabled until a name and a search type are filled in. */
    submitEnabled: 'form button.search-button:not(.disabled):not([disabled])',
    /** Matched by visible text among `form button`. */
    exportButton: 'form button',
    exportButtonText: 'EXPORT',
  },
  confirmModal: {
    root: '.ui.modal.visible.active, .ui.modal.visible, .modal.visible',
    header: '.header',
    content: '.modal-content',
    headerText: 'Credit Deduction',
    cancel: '.actions button.negative',
    confirm: '.actions button.positive',
  },
  result: {
    /** One accordion title per category, in the format `<Category> [N matches]`. */
    title: '.accordion .search-result-div .title.search-title-div',
  },
  exportModal: {
    root: '.ui.modal.visible.active, .ui.modal.visible, .modal.visible',
    successText: 'Report Generation Success',
    link: '.modal a',
  },
} as const;

/**
 * Controls that belong to the person's own adjudication or to monitoring. The client must never
 * click these; the list exists so tests can assert that a fake Sentroweb never saw such a click.
 */
export const SENTROWEB_FORBIDDEN_CONTROLS = {
  falseMatchLabelText: 'All results are false match.',
  saveSelector: '.screening-result-save-button',
  cancelSelector: '.screening-result-cancel-button',
  manageMonitoringText: 'Manage Ongoing Monitoring',
} as const;

export const SENTROWEB_PATTERNS = {
  /** `Balance: 372` anywhere in the header text. */
  balance: /Balance:\s*([\d,]+)/,
  /** The confirm modal text: `1 credit(s) will be deducted for this search.` */
  creditCost: /^\s*(\d+)\s+credit\(s\)\s+will be deducted for this search\.?\s*$/i,
  /** An accordion title: `Special Interest Entities [0 matches]`. */
  categoryTitle: /^(.*?)\s*\[(\d+)\s+matches?\]\s*$/,
} as const;

/** Result categories, keyed the way the parser reports them. */
export type SentrowebCategory = 'FATF' | 'PEP' | 'SIP' | 'SIE';

/** Accordion title text (whitespace-normalised) → category. */
export const SENTROWEB_CATEGORY_TITLES: Record<string, SentrowebCategory> = {
  'FATF Country/ Region': 'FATF',
  'Politically Exposed Persons (PEP)/ Relative or Close Associate of PEP/SIP': 'PEP',
  'Special Interest Persons': 'SIP',
  'Special Interest Entities': 'SIE',
};

/** The JSON arrays in the search response → category. */
export const SENTROWEB_JSON_ARRAYS: Record<string, SentrowebCategory> = {
  fatfCountries: 'FATF',
  pepPersons: 'PEP',
  sipPersons: 'SIP',
  sieEntities: 'SIE',
};

/** Which category titles Sentroweb shows for each search type. */
export const SENTROWEB_EXPECTED_CATEGORIES = {
  ENTITY: ['SIE'],
  INDIVIDUAL: ['FATF', 'PEP', 'SIP'],
} as const satisfies Record<'ENTITY' | 'INDIVIDUAL', readonly SentrowebCategory[]>;
