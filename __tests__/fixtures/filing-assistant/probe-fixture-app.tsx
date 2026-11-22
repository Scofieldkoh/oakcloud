/**
 * A stand-in for a Bizfile officer form, built with real React controlled components, for the
 * extension's Chromium test. It is not a copy of Bizfile's markup; it only reproduces the control
 * patterns the probe has to handle.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const POSITIONS = ['Director', 'Secretary', 'Auditor', 'Chief Executive Officer'];
const NATIONALITIES = ['Singapore Citizen', 'Singapore Permanent Resident', 'Malaysian', 'British'];

function formatDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

function PositionSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  return (
    <div className="custom-select">
      <span id="position-label">Position held</span>
      <div
        role="combobox"
        tabIndex={0}
        aria-labelledby="position-label"
        aria-expanded={open}
        aria-controls="position-list"
        aria-activedescendant={open && active >= 0 ? `position-${active}` : undefined}
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setActive(0);
            } else {
              setActive((current) => Math.min(current + 1, POSITIONS.length - 1));
            }
          } else if (event.key === 'Enter' && open && active >= 0) {
            onChange(POSITIONS[active]);
            setOpen(false);
          }
        }}
      >
        <span>{value || 'Select position'}</span>
      </div>
      {open ? (
        <ul role="listbox" id="position-list">
          {POSITIONS.map((position, index) => (
            <li
              key={position}
              id={`position-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(position);
                setOpen(false);
              }}
            >
              {position}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NationalitySearch({ onChoose }: { onChoose: (value: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const matches = NATIONALITIES.filter((item) => item.toLowerCase().startsWith(query.toLowerCase()));
  return (
    <div className="autocomplete">
      <label htmlFor="nationality">Nationality</label>
      <input
        id="nationality"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="nationality-list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && query ? (
        <ul id="nationality-list" role="listbox">
          {matches.map((item) => (
            <li
              key={item}
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(item);
                onChoose(item);
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

function OfficerForm() {
  const [name, setName] = useState('');
  const [strict, setStrict] = useState('');
  const [date, setDate] = useState('');
  const [position, setPosition] = useState('');
  const [residency, setResidency] = useState('');
  const [nationality, setNationality] = useState('');
  const [nextClicks, setNextClicks] = useState(0);
  const [submitClicks, setSubmitClicks] = useState(0);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <h1>Change in company officers</h1>
      <label htmlFor="full-name">Full name</label>
      <input id="full-name" value={name} onChange={(event) => setName(event.target.value)} />

      <label htmlFor="strict-id">Identification number</label>
      <input
        id="strict-id"
        value={strict}
        onChange={(event) => {
          // Models a component that ignores input not marked as coming from the user.
          if (event.nativeEvent.isTrusted) setStrict(event.target.value);
        }}
      />

      <label htmlFor="appointment-date">Date of appointment</label>
      <input id="appointment-date" placeholder="DD/MM/YYYY" value={date} onChange={(event) => setDate(formatDate(event.target.value))} />

      <PositionSelect value={position} onChange={setPosition} />

      <fieldset>
        <legend>Residency status</legend>
        <label>
          <input type="radio" name="residency" value="resident" checked={residency === 'resident'} onChange={() => setResidency('resident')} />
          Singapore resident
        </label>
        <label>
          <input type="radio" name="residency" value="foreign" checked={residency === 'foreign'} onChange={() => setResidency('foreign')} />
          Foreigner
        </label>
      </fieldset>

      <NationalitySearch onChoose={setNationality} />

      <label>
        <input type="checkbox" id="declaration" />I declare that the information given is true
      </label>

      <button type="button" onClick={() => setNextClicks((count) => count + 1)}>
        Next
      </button>
      <button type="submit" onClick={() => setSubmitClicks((count) => count + 1)}>
        Submit
      </button>

      <pre id="state">{JSON.stringify({ name, strict, date, position, residency, nationality, nextClicks, submitClicks })}</pre>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(<OfficerForm />);
