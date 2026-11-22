/**
 * A stand-in for Bizfile's "Appoint/Withdraw position holders" screen, built with React, for the
 * Filing Assistant's Chromium tests. It reproduces patterns seen on the live screen (2026-11-22),
 * not its markup: no fields until "Add position holder" is clicked, doubled radio labels with ids
 * regenerated on every render, a "Select position" input without a dropdown role, labels given only
 * as nearby text, a shared name="text-input", dates validated as DD MMM YYYY, and footer buttons.
 *
 * Sections depend on choices, as on Bizfile: Individual shows the person's fields, Corporate the
 * entity's; Local and Foreign address types show different address fields.
 *
 * ?variant= simulates Bizfile changing the screen, or other dropdown builds:
 *   renamed     the ID number field's id changes (label unchanged)
 *   relabelled  the appointment date's id and label both change
 *   slashdates  dates must be DD/MM/YYYY
 *   sgds        Position held is an SGDS-style dropdown: opened from its chevron only, the menu stays
 *               in the page once shown and is hidden by style, options are buttons
 *   typing      as sgds but with no chevron: the list opens and filters only as you type
 */
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const variant = new URLSearchParams(window.location.search).get('variant') ?? 'base';
const POSITIONS = ['Director', 'Secretary', 'Chief Executive Officer', 'Auditor'];

type Card = {
  category: string;
  position: string;
  appointmentDate: string;
  idNumber: string;
  name: string;
  email: string;
  uen: string;
  entityName: string;
  addressType: string;
  postalCode: string;
  foreignAddress1: string;
  idType: string;
  nationality: string;
  retrieved: boolean;
  block: string;
  street: string;
  /** Test instrumentation: set when anything types an ID number while NRIC or FIN is chosen (or nothing is). */
  nricTyped: boolean;
};

const NATIONALITIES = ['American', 'British', 'Chinese', 'Malaysian', 'Singapore Citizen', 'Singapore Permanent Resident'];

/** A search-as-you-type field: suggestions appear only after typing. */
function NationalitySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = query ? NATIONALITIES.filter((item) => item.toLowerCase().startsWith(query.toLowerCase())) : [];
  return (
    <div className="field autocomplete">
      <label htmlFor="appoint-position-holder-card-1-individual-nationality">Nationality</label>
      <input
        id="appoint-position-holder-card-1-individual-nationality"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="nationality-suggestions"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange('');
        }}
      />
      {open && matches.length ? (
        <ul role="listbox" id="nationality-suggestions">
          {matches.map((item) => (
            <li
              key={item}
              role="option"
              aria-selected={false}
              onClick={() => {
                setQuery(item);
                onChange(item);
                setOpen(false);
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SR_ONLY = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
const ID_TYPES = ['NRIC (Citizen)', 'NRIC (PR)', 'FIN', 'Passport'];

function Doubled({ text }: { text: string }) {
  return (
    <>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{text}</span>
      <span>{text}</span>
    </>
  );
}

/**
 * A plain custom select whose menu nests rows inside a scroll area, with no option roles or
 * well-known classes: the container holding every option must not be read as one option.
 */
function PlainSelect({ placeholder, options, value, onChange }: { placeholder: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="select-field">
      <input placeholder={placeholder} readOnly value={value} onClick={() => setOpen((current) => !current)} />
      {open ? (
        <div className="select-menu">
          <div className="select-menu__scroll">
            {options.map((option) => (
              <div
                key={option}
                className="select-menu__row"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Like the SGDS Combobox: typing opens and filters the list; the menu is kept once rendered. */
function SgdsPositionSelect({ value, onChange, chevron }: { value: string; onChange: (value: string) => void; chevron: boolean }) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [query, setQuery] = useState(value);
  useEffect(() => setQuery(value), [value]);
  const show = (next: boolean) => {
    setOpen(next);
    if (next) setRendered(true);
  };
  const filter = query !== value ? query.toLowerCase() : '';
  const items = POSITIONS.filter((position) => position.toLowerCase().startsWith(filter));
  return (
    <div className="dropdown combobox">
      <input
        className="form-control dropdown-toggle"
        placeholder="Select position"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          show(true);
        }}
      />
      {chevron ? (
        <span className="form-control-icon chevron" onClick={() => show(!open)}>
          ▾
        </span>
      ) : null}
      {rendered ? (
        <ul className="dropdown-menu" style={{ display: open ? 'block' : 'none' }}>
          {items.map((position) => (
            <li key={position}>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onChange(position);
                  setQuery(position);
                  show(false);
                }}
              >
                {position}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Radios({ legend, options, value, onChange }: { legend: string; options: string[]; value: string; onChange: (value: string) => void }) {
  // Like Bizfile, the radio ids are random and change whenever the group renders afresh.
  const ids = useMemo(() => options.map(() => crypto.randomUUID()), [options]);
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map((option, index) => (
        // Two labels per radio, as on Bizfile: a visible one and one for screen readers.
        <div key={option} className="radio-card">
          <input type="radio" id={ids[index]} checked={value === option} onChange={() => onChange(option)} />
          <label htmlFor={ids[index]}>
            <Doubled text={option} />
          </label>
          <label htmlFor={ids[index]} style={SR_ONLY}>
            {option}
          </label>
        </div>
      ))}
    </fieldset>
  );
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState('');
  const pattern = variant === 'slashdates' ? /^\d{2}\/\d{2}\/\d{4}$/ : /^\d{2} [A-Z][a-z]{2} \d{4}$/;
  const message = variant === 'slashdates' ? 'Enter the date as DD/MM/YYYY' : 'Enter the date as DD MMM YYYY';
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type="text"
        aria-describedby={id + '-error'}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (pattern.test(event.target.value)) setError('');
        }}
        onBlur={(event) => setError(event.target.value && !pattern.test(event.target.value) ? message : '')}
      />
      {error ? (
        <p id={id + '-error'} role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextField({ id, label, name, value, onChange, readOnly }: { id: string; label: string; name: string; value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <input id={id} name={name} type="text" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

const CATEGORIES = ['Individual', 'Corporate'];
const ADDRESS_TYPES = ['Local', 'Foreign'];

function AppointCard({ card, update }: { card: Card; update: (patch: Partial<Card>) => void }) {
  const dateId = variant === 'relabelled' ? 'appointment-date-input' : 'appoint-position-holder-card-1-position-held-1-date-of-appointment';
  const dateLabel = variant === 'relabelled' ? 'Appointment date' : 'Date of appointment';
  const idNumberId = variant === 'renamed' ? 'appoint-position-holder-card-1-person-id-no' : 'appoint-position-holder-card-1-individual-id-number';
  return (
    <div className="card">
      <Radios legend="Category" options={CATEGORIES} value={card.category} onChange={(category) => update({ category })} />
      {variant === 'sgds' || variant === 'typing' ? (
        <SgdsPositionSelect value={card.position} onChange={(position) => update({ position })} chevron={variant === 'sgds'} />
      ) : (
        <PlainSelect placeholder="Select position" options={POSITIONS} value={card.position} onChange={(position) => update({ position })} />
      )}
      <DateField id={dateId} label={dateLabel} value={card.appointmentDate} onChange={(appointmentDate) => update({ appointmentDate })} />
      {card.category === 'Individual' ? (
        <>
          <div className="field">
            <div className="label">Identification type</div>
            <PlainSelect placeholder="Select identification type" options={ID_TYPES} value={card.idType} onChange={(idType) => update({ idType })} />
          </div>
          <TextField
            id={idNumberId}
            label="Identification number"
            name="text-input"
            value={card.idNumber}
            onChange={(idNumber) => update({ idNumber, ...(idNumber && card.idType !== 'Passport' ? { nricTyped: true } : {}) })}
          />
          {/* Like Bizfile: for NRIC holders, particulars are retrieved from government records and locked. */}
          <button type="button" disabled={!card.idType.startsWith('NRIC') || !card.idNumber} onClick={() => update({ name: 'TAN AH KOW', retrieved: true })}>
            Retrieve information
          </button>
          {card.idType === 'Passport' ? <NationalitySearch value={card.nationality} onChange={(nationality) => update({ nationality })} /> : null}
          <TextField
            id="appoint-position-holder-card-1-individual-name"
            label="Name (As per NRIC/Identification document)"
            name="text-input"
            value={card.name}
            readOnly={card.retrieved}
            onChange={(name) => update({ name })}
          />
          <TextField id="appoint-position-holder-card-1-individual-email" label="Email address" name="email-text-input" value={card.email} onChange={(email) => update({ email })} />
        </>
      ) : null}
      {card.category === 'Corporate' ? (
        <>
          <TextField id="appoint-position-holder-card-1-corporate-uen" label="UEN" name="text-input" value={card.uen} onChange={(uen) => update({ uen })} />
          <TextField id="appoint-position-holder-card-1-corporate-name" label="Entity name" name="text-input" value={card.entityName} onChange={(entityName) => update({ entityName })} />
        </>
      ) : null}
      {card.category ? <Radios legend="Address type" options={ADDRESS_TYPES} value={card.addressType} onChange={(addressType) => update({ addressType })} /> : null}
      {card.addressType === 'Local' ? (
        <>
          <TextField id="appoint-position-holder-card-1-postal-code" label="Postal code" name="text-input" value={card.postalCode} onChange={(postalCode) => update({ postalCode })} />
          {/* Like an address lookup: the rest of the address appears once a postal code is typed. */}
          {card.postalCode.length === 6 ? (
            <>
              <TextField id="appoint-position-holder-card-1-block" label="Block / house number" name="text-input" value={card.block} onChange={(block) => update({ block })} />
              <TextField id="appoint-position-holder-card-1-street" label="Street name" name="text-input" value={card.street} onChange={(street) => update({ street })} />
            </>
          ) : null}
        </>
      ) : null}
      {card.addressType === 'Foreign' ? (
        <TextField id="input-foreign-address-line-1" label="Foreign address line 1" name="input-foreign-address-line-1" value={card.foreignAddress1} onChange={(foreignAddress1) => update({ foreignAddress1 })} />
      ) : null}
    </div>
  );
}

function Screen() {
  const [card, setCard] = useState<Card | null>(null);
  const [clicks, setClicks] = useState({ back: 0, save: 0, review: 0 });
  const count = (key: keyof typeof clicks) => setClicks((current) => ({ ...current, [key]: current[key] + 1 }));
  return (
    <main>
      <h1>Appoint/Withdraw position holders</h1>
      <h2>Appoint position holder</h2>
      {card ? <AppointCard card={card} update={(patch) => setCard((current) => ({ ...(current as Card), ...patch }))} /> : null}
      <button
        type="button"
        onClick={() =>
          setCard(
            (current) =>
              current ?? {
                category: '',
                position: '',
                appointmentDate: '',
                idNumber: '',
                name: '',
                email: '',
                uen: '',
                entityName: '',
                addressType: '',
                postalCode: '',
                foreignAddress1: '',
                idType: '',
                nationality: '',
                retrieved: false,
                block: '',
                street: '',
                nricTyped: false,
              },
          )
        }
      >
        + Add position holder
      </button>
      <h2>Withdraw position holder</h2>
      <p>1. KOH ZHI YONG · Director, Secretary, Shareholder</p>
      <footer>
        <button type="button" onClick={() => count('back')}>
          Back
        </button>
        <button type="button" onClick={() => count('save')}>
          Save draft
        </button>
        <button type="button" onClick={() => count('review')}>
          Review and confirm
        </button>
      </footer>
      <pre id="state">{JSON.stringify({ card, clicks })}</pre>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Screen />);
