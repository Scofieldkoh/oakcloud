/**
 * A stand-in for Bizfile's "Appoint/Withdraw position holders" screen, built with React, for the
 * Filing Assistant's Chromium tests. It reproduces patterns seen on the live screen (2026-11-22),
 * not its markup: no fields until "Add position holder" is clicked, doubled radio labels with ids
 * regenerated on every render, a "Select position" input without a dropdown role, labels given only
 * as nearby text, a shared name="text-input", dates validated as DD MMM YYYY, and footer buttons.
 *
 * ?variant= simulates Bizfile changing the screen:
 *   renamed     the ID number field's id changes (label unchanged)
 *   relabelled  the appointment date's id and label both change
 *   slashdates  dates must be DD/MM/YYYY
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const variant = new URLSearchParams(window.location.search).get('variant') ?? 'base';
const POSITIONS = ['Director', 'Secretary', 'Chief Executive Officer', 'Auditor'];

type Card = { category: string; position: string; appointmentDate: string; idNumber: string; name: string; email: string };

function Doubled({ text }: { text: string }) {
  return (
    <>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{text}</span>
      <span>{text}</span>
    </>
  );
}

function PositionSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="position-field">
      <input placeholder="Select position" readOnly value={value} onClick={() => setOpen((current) => !current)} />
      {open ? (
        <div className="dropdown-menu">
          {POSITIONS.map((position) => (
            <div
              key={position}
              className="dropdown-item"
              onClick={() => {
                onChange(position);
                setOpen(false);
              }}
            >
              {position}
            </div>
          ))}
        </div>
      ) : null}
    </div>
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

function TextField({ id, label, name, value, onChange }: { id: string; label: string; name: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <input id={id} name={name} type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function AppointCard({ card, update }: { card: Card; update: (patch: Partial<Card>) => void }) {
  // Like Bizfile, the radio ids are random and change whenever the card renders afresh.
  const ids = useMemo(() => ({ individual: crypto.randomUUID(), corporate: crypto.randomUUID() }), []);
  const dateId = variant === 'relabelled' ? 'appointment-date-input' : 'appoint-position-holder-card-1-position-held-1-date-of-appointment';
  const dateLabel = variant === 'relabelled' ? 'Appointment date' : 'Date of appointment';
  const idNumberId = variant === 'renamed' ? 'appoint-position-holder-card-1-person-id-no' : 'appoint-position-holder-card-1-individual-id-number';
  return (
    <div className="card">
      <fieldset>
        <legend>Category</legend>
        <label htmlFor={ids.individual}>
          <input type="radio" id={ids.individual} checked={card.category === 'Individual'} onChange={() => update({ category: 'Individual' })} />
          <Doubled text="Individual" />
        </label>
        <label htmlFor={ids.corporate}>
          <input type="radio" id={ids.corporate} checked={card.category === 'Corporate'} onChange={() => update({ category: 'Corporate' })} />
          <Doubled text="Corporate" />
        </label>
      </fieldset>
      <PositionSelect value={card.position} onChange={(position) => update({ position })} />
      <DateField id={dateId} label={dateLabel} value={card.appointmentDate} onChange={(appointmentDate) => update({ appointmentDate })} />
      <TextField id={idNumberId} label="Identification number" name="text-input" value={card.idNumber} onChange={(idNumber) => update({ idNumber })} />
      <TextField id="appoint-position-holder-card-1-individual-name" label="Name (As per NRIC/Identification document)" name="text-input" value={card.name} onChange={(name) => update({ name })} />
      <TextField id="appoint-position-holder-card-1-individual-email" label="Email address" name="email-text-input" value={card.email} onChange={(email) => update({ email })} />
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
      <button type="button" onClick={() => setCard((current) => current ?? { category: '', position: '', appointmentDate: '', idNumber: '', name: '', email: '' })}>
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
