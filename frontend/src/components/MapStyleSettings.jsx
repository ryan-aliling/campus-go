import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { normalizeColor, parseColor, toHex } from '../colors.js';
import { useToast } from '../hooks/useToast.jsx';
import { t, useSettings } from '../i18n.js';
import { buildingColour, isDark } from '../map-3d.js';
import { groundHtml, pinHtml, puckHtml } from '../map-pins.js';
import {
  DEFAULT_MAP_STYLE,
  PRESETS,
  cleanStyle,
  saveMapStyle,
  sonarData,
  styleVariables,
  useMapStyle,
} from '../mapStyle.js';
import { Button } from './Button.jsx';
import { Icon } from './icons.jsx';
import { Dialog, Modal } from './Sheet.jsx';
import { BEFORE_PAGE_CLOSE } from '../unsaved-navigation.js';

const BASES = [
  ['follow', 'Follow the app'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
const PRESET_NAMES = {
  classic: 'Classic',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  mono: 'Mono',
};
/** The map themes in the order the carousel shows them. */
const THEMES = Object.keys(PRESETS);
// Two taps on the same element within this time count as a double tap (phones do not all send dblclick).
const DOUBLE_TAP_MS = 400;
const SWIPE_PX = 40;

const channelOf = (event) =>
  Math.max(0, Math.min(255, Math.round(Number(event.target.value) || 0)));
const sameStyle = (a, b) => JSON.stringify(cleanStyle(a)) === JSON.stringify(cleanStyle(b));
/**
 * `style` with the sonar settings of `saved`: on/off, speed, look and flash belong to the preferences and are saved
 * there at once, so this card only owns the ring's colour.
 */
const withSonarOf = (style, saved) =>
  cleanStyle({ ...style, sonar: { ...saved.sonar, color: style.sonar.color } });

/** Edits one colour: picker, a text field for #rrggbb or rgb(r, g, b), and R, G, B. */
function ColourEditor({ label, value, onChange }) {
  const id = useId();
  const [text, setText] = useState(value);
  const rgb = parseColor(value);
  const bad = normalizeColor(text) === null;

  useEffect(() => {
    setText((now) => (normalizeColor(now) === value ? now : value));
  }, [value]);

  const setChannel = (key) => (event) => onChange(toHex({ ...rgb, [key]: channelOf(event) }));

  return (
    <div className="mapstyle__editor" data-testid={`colour-${label}`}>
      <div className="mapstyle__editor-row">
        <input
          type="color"
          className="mapstyle__picker"
          value={value}
          aria-label={t('{name}: pick a colour', { name: label })}
          onChange={(event) => onChange(normalizeColor(event.target.value))}
        />
        <div className="mapstyle__field mapstyle__field--hex">
          <label htmlFor={`${id}-hex`} className="caption">
            {t('Colour code')}
          </label>
          <input
            id={`${id}-hex`}
            className={`field field--tight${bad ? ' field-error' : ''}`}
            value={text}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={bad || undefined}
            onChange={(event) => {
              setText(event.target.value);
              const next = normalizeColor(event.target.value);
              if (next) onChange(next);
            }}
          />
        </div>
        {['r', 'g', 'b'].map((key) => (
          <div key={key} className="mapstyle__field">
            <label htmlFor={`${id}-${key}`} className="caption">
              {key.toUpperCase()} (0–255)
            </label>
            <input
              id={`${id}-${key}`}
              className="field field--tight"
              type="number"
              inputMode="numeric"
              min={0}
              max={255}
              value={rgb[key]}
              onChange={setChannel(key)}
            />
          </div>
        ))}
      </div>
      {bad && (
        <p className="field-note field-note--error" role="alert">
          <Icon name="warn" size={18} />
          <span>{t('Use a colour like #1a2b3c or rgb(26, 43, 60).')}</span>
        </p>
      )}
    </div>
  );
}

/** Every colour of `style` as CSS variables for a preview (the default building colour suits light or dark). */
function previewVariables(style, theme) {
  const variables = Object.fromEntries(
    Object.entries(styleVariables(style, { keepDefaults: true })).filter(
      ([, v]) => v !== undefined,
    ),
  );
  variables['--buildings'] = buildingColour(style, isDark(style, theme));
  return variables;
}

function Preview({ style, theme }) {
  const variables = previewVariables(style, theme);
  const sonar = sonarData(style);
  return (
    <div
      className="mapstyle__preview"
      data-base={style.base === 'follow' ? undefined : style.base}
      data-sonar={sonar.sonar}
      data-sonar-look={sonar.sonarLook}
      data-sonar-speed={sonar.sonarSpeed}
      style={variables}
      role="img"
      aria-label={t('Preview of your map style')}
    >
      <span className="mapstyle__buildings" aria-hidden="true">
        <span className="mapstyle__building" />
        <span className="mapstyle__building mapstyle__building--tall" />
        <span className="mapstyle__building" />
      </span>
      <span className="mapstyle__route" />
      <span className="mapstyle__preview-pins" aria-hidden="true">
        <span className="mapstyle__pin mapstyle__pin--open" />
        <span className="mapstyle__pin mapstyle__pin--done" />
        <span className="mapstyle__pin mapstyle__pin--locked" />
        <span className="mapstyle__pin mapstyle__pin--selected" />
      </span>
      <span className="mapstyle__puck" data-testid="preview-ball" aria-hidden="true">
        <span className="puck-sonar mapstyle__sonar" data-testid="preview-sonar">
          <span className="puck-sonar__wave" />
          <span className="puck-sonar__edge" />
        </span>
        <span className="mapstyle__puck-beam" />
        <span className="mapstyle__puck-ball" />
      </span>
    </div>
  );
}

const SAMPLE = { name: 'Library', isActive: true, completed: false };
/** The checkpoint pin each pin colour belongs to, and whether it is the selected one. */
const PIN_SAMPLES = {
  open: [SAMPLE, false],
  done: [{ ...SAMPLE, completed: true }, false],
  locked: [{ ...SAMPLE, isActive: false }, false],
  highlight: [SAMPLE, true],
};
const markup = (html) => ({ __html: html });

/** A little street map behind every close-up, so each colour is seen on the kind of map it is used on. */
function Streets() {
  return (
    <svg
      className="mapstyle__streets"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        className="mapstyle__blocks"
        d="M0 0h98v58H0zM126 0h88v58h-88zM242 0h78v58h-78zM0 86h98v74H0zM126 86h88v74h-88zM242 86h78v74h-78z"
      />
      <path className="mapstyle__roads" d="M0 72h320M112 0v160M228 0v160" />
    </svg>
  );
}

/** The walking route from the ball to a checkpoint, along the streets. */
function RouteScene() {
  return (
    <svg className="mapstyle__scene" viewBox="0 0 320 160" aria-hidden="true">
      <path className="mapstyle__route-line" d="M52 128V72H228V30" />
      <circle className="mapstyle__route-start" cx="52" cy="128" r="9" />
      <rect className="mapstyle__route-end" x="219" y="12" width="18" height="18" rx="2" />
    </svg>
  );
}

/** A few raised buildings, as on the 3D map. */
function BuildingsScene() {
  return (
    <span className="mapstyle__focus-buildings" aria-hidden="true">
      {[44, 76, 58, 34].map((height) => (
        <span key={height} className="mapstyle__focus-building" style={{ height }} />
      ))}
    </span>
  );
}

/** The ball as on the map; with `ring` the sonar range ring round it, otherwise the direction wedge. */
function BallScene({ ring }) {
  return (
    <span className="mapstyle__focus-ball" data-testid="preview-ball" aria-hidden="true">
      {ring ? (
        <span className="puck-sonar">
          <span className="puck-sonar__wave" />
          <span className="puck-sonar__edge" />
        </span>
      ) : (
        <span className="mapstyle__focus-ground" dangerouslySetInnerHTML={markup(groundHtml(35))} />
      )}
      <span className="mapstyle__focus-orb" dangerouslySetInnerHTML={markup(puckHtml())} />
    </span>
  );
}

function closeUp(element) {
  if (PIN_SAMPLES[element]) {
    const [checkpoint, selected] = PIN_SAMPLES[element];
    return (
      <span
        className="mapstyle__focus-pin"
        aria-hidden="true"
        dangerouslySetInnerHTML={markup(pinHtml(checkpoint, selected))}
      />
    );
  }
  if (element === 'ball' || element === 'ball-lines') return <BallScene />;
  if (element === 'sonar') return <BallScene ring />;
  if (element === 'route') return <RouteScene />;
  if (element === 'buildings') return <BuildingsScene />;
  return null; // The tint: the street map itself is the close-up.
}

/**
 * A close-up of the one element whose colour is being edited, on a small street map: the real pin, the ball, the
 * sonar ring, the route, the buildings or the tinted map. Every close-up has the same size, so every popup does too.
 * The sonar shows even while it is turned off, since its colour is what is being picked.
 */
function ElementPreview({ style, theme, element }) {
  return (
    <div
      className="mapstyle__preview mapstyle__focus"
      data-base={style.base === 'follow' ? undefined : style.base}
      data-dark={isDark(style, theme) || undefined}
      data-sonar="on"
      data-sonar-look={style.sonar.look}
      data-sonar-speed={style.sonar.speed}
      style={previewVariables(style, theme)}
      role="img"
      aria-label={t('Preview of your map style')}
    >
      <Streets />
      {closeUp(element)}
    </div>
  );
}

/**
 * The map themes (Classic, Ocean, ...) as a carousel round the preview: the arrows and a swipe go to the next or the
 * previous theme, round in a circle. A theme whose colours were changed one by one is shown as "Custom".
 */
function ThemeCarousel({ style, theme, onStep }) {
  const id = useId();
  const [slide, setSlide] = useState({ n: 0, way: '' });
  const touchStart = useRef(null);
  const custom = !THEMES.includes(style.preset);

  const step = (way) => {
    setSlide((now) => ({ n: now.n + 1, way: way > 0 ? 'next' : 'prev' }));
    onStep(way);
  };

  return (
    <section className="mapstyle__section" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="strong mapstyle__heading">
        {t('Map theme')}
      </h3>
      <div
        className="mapstyle__carousel"
        role="group"
        aria-roledescription="carousel"
        aria-label={t('Map theme')}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const delta = event.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(delta) > SWIPE_PX) step(delta < 0 ? 1 : -1);
        }}
      >
        <button
          type="button"
          className="mapstyle__arrow mapstyle__arrow--prev"
          aria-label={t('Previous map theme')}
          onClick={() => step(-1)}
        >
          <Icon name="chevron" />
        </button>
        <div key={slide.n} className="mapstyle__stage" data-slide={slide.way || undefined}>
          <Preview style={style} theme={theme} />
        </div>
        <button
          type="button"
          className="mapstyle__arrow"
          aria-label={t('Next map theme')}
          onClick={() => step(1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div className="mapstyle__theme-name" aria-live="polite" data-testid="map-theme-name">
        <span className="strong">{custom ? t('Custom') : t(PRESET_NAMES[style.preset])}</span>
      </div>
      <span className="mapstyle__dots" aria-hidden="true">
        {THEMES.map((name) => (
          <span key={name} className="mapstyle__dot" data-on={name === style.preset || undefined} />
        ))}
      </span>
    </section>
  );
}

/** The single colours, by what they belong to on the map. `title` names the colour in the editor's popup. */
function colourGroups(style, theme) {
  const item = (id, label, title, value, set) => ({ id, label, title, value, set });
  return [
    {
      id: 'checkpoints',
      name: 'Checkpoints',
      items: [
        item('open', 'Open', 'Open checkpoints', style.pins.open, (hex) => ({
          pins: { ...style.pins, open: hex },
        })),
        item('done', 'Cleared', 'Cleared checkpoints', style.pins.done, (hex) => ({
          pins: { ...style.pins, done: hex },
        })),
        item('locked', 'Locked', 'Locked checkpoints', style.pins.locked, (hex) => ({
          pins: { ...style.pins, locked: hex },
        })),
        item(
          'highlight',
          'Selected',
          'Highlight (selected checkpoint)',
          style.highlight,
          (hex) => ({
            highlight: hex,
          }),
        ),
      ],
    },
    {
      id: 'position',
      name: 'Your position',
      items: [
        item('ball', 'Ball', 'Your position: ball', style.ball.body, (hex) => ({
          ball: { ...style.ball, body: hex },
        })),
        item(
          'ball-lines',
          'Direction indicator',
          'Your position: direction indicator',
          style.ball.lines,
          (hex) => ({ ball: { ...style.ball, lines: hex } }),
        ),
      ],
    },
    {
      id: 'sonar',
      name: 'Sonar',
      items: [
        item('sonar', 'Range ring', 'Sonar range ring', style.sonar.color, (hex) => ({
          sonar: { ...style.sonar, color: hex },
        })),
      ],
    },
    {
      id: 'map',
      name: 'Map',
      items: [
        item('tint', 'Tint', 'Map tint', style.tint.color, (hex) => ({
          tint: { color: hex, strength: style.tint.strength || 30 },
        })),
        item('route', 'Walking route', 'Walking route', style.route, (hex) => ({ route: hex })),
        item(
          'buildings',
          'Buildings',
          'Buildings (3D map)',
          buildingColour(style, isDark(style, theme)),
          (hex) => ({ buildings: hex }),
        ),
      ],
    },
  ];
}

/**
 * The single colours in groups. A tap selects an element; a double tap (a double-click, or Enter) opens its colour
 * editor in a popup.
 */
function AdvancedColours({ groups, picked, onPick, onEdit }) {
  const id = useId();
  const lastTap = useRef({ id: null, at: 0 });

  const tap = (itemId) => (event) => {
    const now = performance.now();
    const again = lastTap.current.id === itemId && now - lastTap.current.at < DOUBLE_TAP_MS;
    // A press of Enter or Space has no pointer (detail 0): it opens the editor at once.
    const open = event.detail === 0 || event.detail >= 2 || again;
    lastTap.current = open ? { id: null, at: 0 } : { id: itemId, at: now };
    onPick(itemId);
    if (open) onEdit(itemId);
  };

  return (
    <section className="mapstyle__section" aria-labelledby={`${id}-h`}>
      <div className="mapstyle__advanced-head">
        <h3 id={`${id}-h`} className="strong mapstyle__heading">
          {t('Advanced')}
        </h3>
        <span className="tip">
          <button
            type="button"
            className="tip__button"
            aria-label={t('How to edit a colour')}
            aria-describedby={`${id}-tip`}
          >
            i
          </button>
          <span id={`${id}-tip`} role="tooltip" className="tip__text">
            {t('Double-tap to edit specific colours for selected elements.')}
          </span>
        </span>
      </div>
      {groups.map((group) => (
        <div
          key={group.id}
          className="mapstyle__group"
          role="group"
          aria-labelledby={`${id}-${group.id}`}
        >
          <p id={`${id}-${group.id}`} className="caption muted mapstyle__group-name">
            {t(group.name)}
          </p>
          <ul className="mapstyle__chips">
            {group.items.map((colour) => (
              <li key={colour.id}>
                <button
                  type="button"
                  className="mapstyle__chip"
                  aria-pressed={picked === colour.id}
                  aria-haspopup="dialog"
                  aria-label={t(colour.title)}
                  onClick={tap(colour.id)}
                >
                  <span
                    className="mapstyle__swatch"
                    style={{ background: colour.value }}
                    aria-hidden="true"
                  />
                  <span className="small">{t(colour.label)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * Customisation on the profile (BR48): the map theme, light or dark, and the single colours. One style is saved on
 * the account, so it follows the student to other devices. The card is closed until opened and edits a colour in a
 * popup, so it stays short on a phone. The sonar's on/off, speed, look and flash are in the preferences.
 */
export function MapStyleSettings() {
  const toast = useToast();
  const { theme } = useSettings();
  const saved = useMapStyle();
  const details = useRef(null);
  const [draft, setDraft] = useState(saved);
  const [picked, setPicked] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const pendingExit = useRef(null);
  const lastSaved = useRef(saved);
  const lastTheme = useRef(THEMES.includes(saved.preset) ? saved.preset : THEMES[0]);

  // The account's style arrives after sign-in. A sonar change in the preferences is saved at once and must not throw
  // away colours that are being changed here.
  useEffect(() => {
    const before = lastSaved.current;
    lastSaved.current = saved;
    setDraft((now) => (sameStyle(now, before) ? saved : withSonarOf(now, saved)));
  }, [saved]);

  const shown = withSonarOf(draft, saved);
  const changed = !sameStyle(shown, saved);
  const defaults = withSonarOf(DEFAULT_MAP_STYLE, saved);
  const groups = colourGroups(shown, theme);
  const current = groups.flatMap((group) => group.items).find((c) => c.id === editing);

  const handleSummaryClick = (event) => {
    if (!details.current?.open || !changed) return;
    event.preventDefault();
    pendingExit.current = () => {
      if (details.current) details.current.open = false;
    };
    setConfirmExit(true);
  };

  useEffect(() => {
    const handlePageClose = (event) => {
      if (!changed) return;
      event.preventDefault();
      pendingExit.current = event.detail?.confirm;
      setConfirmExit(true);
    };
    window.addEventListener(BEFORE_PAGE_CLOSE, handlePageClose);
    return () => window.removeEventListener(BEFORE_PAGE_CLOSE, handlePageClose);
  }, [changed]);

  const saveAndLeave = async () => {
    setBusy('exit');
    setError('');
    try {
      await saveMapStyle(api, shown);
      const leave = pendingExit.current;
      pendingExit.current = null;
      setConfirmExit(false);
      leave?.();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  };

  const stepTheme = (way) => {
    const from = THEMES.includes(draft.preset) ? draft.preset : lastTheme.current;
    const name = THEMES[(THEMES.indexOf(from) + way + THEMES.length) % THEMES.length];
    lastTheme.current = name;
    const preset = PRESETS[name];
    setDraft((now) =>
      cleanStyle({
        ...preset,
        base: now.base,
        sonar: { ...now.sonar, color: preset.sonar.color },
      }),
    );
  };

  const run = async (key, work, done) => {
    setBusy(key);
    setError('');
    try {
      await work();
      toast.info(done);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  };

  return (
    <details ref={details} className="card mapstyle" data-testid="map-style">
      <summary className="mapstyle__summary" onClick={handleSummaryClick}>
        <span className="display h3">{t('Customisation')}</span>
        <span className="small muted">{t('Tap to expand')}</span>
      </summary>
      <div className="mapstyle__body">
        <p className="small muted">
          {t('Your customisation is saved on your account and follows you to other devices.')}
        </p>

        <ThemeCarousel style={shown} theme={theme} onStep={stepTheme} />

        <section className="mapstyle__section">
          <div className="seg seg--3" role="radiogroup" aria-label={t('Light or dark map')}>
            {BASES.map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={draft.base === id}
                onClick={() => setDraft((now) => cleanStyle({ ...now, base: id }))}
              >
                {t(name)}
              </button>
            ))}
          </div>
        </section>

        <AdvancedColours groups={groups} picked={picked} onPick={setPicked} onEdit={setEditing} />

        {error && (
          <p className="field-note field-note--error" role="alert">
            <Icon name="warn" size={18} />
            <span>{error}</span>
          </p>
        )}
        <div className="grid2">
          <Button
            small
            busy={busy === 'save'}
            disabled={!changed}
            onClick={() => run('save', () => saveMapStyle(api, shown), t('Customisation saved'))}
          >
            {t('Save customisation')}
          </Button>
          <Button
            small
            variant="ghost"
            busy={busy === 'reset'}
            disabled={sameStyle(saved, defaults) && !changed}
            onClick={() =>
              // The saved defaults replace the draft too, even when it had unsaved colours.
              run(
                'reset',
                async () => setDraft(await saveMapStyle(api, defaults)),
                t('Customisation reset'),
              )
            }
          >
            {t('Reset to default')}
          </Button>
        </div>
      </div>

      {current && (
        <Dialog
          title={t(current.title)}
          closeLabel={t('Close')}
          onClose={() => setEditing(null)}
          className="mapstyle__dialog"
        >
          <div className="mapstyle__dialog-body">
            <ElementPreview style={shown} theme={theme} element={current.id} />
            <div className="mapstyle__dialog-edit">
              <ColourEditor
                key={current.id}
                label={t(current.title)}
                value={current.value}
                onChange={(hex) =>
                  setDraft((now) => cleanStyle({ ...now, preset: 'custom', ...current.set(hex) }))
                }
              />
              {current.id === 'tint' && (
                <div className="mapstyle__field">
                  <label htmlFor="tint-strength" className="caption">
                    {t('Tint strength: {n}%', { n: draft.tint.strength })}
                  </label>
                  <input
                    id="tint-strength"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draft.tint.strength}
                    onChange={(event) =>
                      setDraft((now) =>
                        cleanStyle({
                          ...now,
                          preset: 'custom',
                          tint: { ...now.tint, strength: Number(event.target.value) },
                        }),
                      )
                    }
                  />
                </div>
              )}
            </div>
            <Button small onClick={() => setEditing(null)}>
              {t('Done')}
            </Button>
          </div>
        </Dialog>
      )}
      {confirmExit && (
        <Modal title={t('Unsaved changes')} onClose={() => setConfirmExit(false)}>
          <div className="stack">
            <p>{t('You have unsaved changes. Do you want to leave without saving?')}</p>
            <div className="mapstyle__exit-actions">
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>
                {t('Keep editing')}
              </Button>
              <Button variant="ok" busy={busy === 'exit'} onClick={saveAndLeave}>
                {t('Save and leave')}
              </Button>
              <Button
                className="btn--danger"
                onClick={() => {
                  const leave = pendingExit.current;
                  pendingExit.current = null;
                  setConfirmExit(false);
                  leave?.();
                }}
              >
                {t('Leave without saving')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </details>
  );
}
