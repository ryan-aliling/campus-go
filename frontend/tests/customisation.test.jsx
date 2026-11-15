// Customisation on the profile (BR48): the map theme carousel, light or dark, and the single colours in groups,
// each edited in a popup that opens on a double-click.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStyleSettings } from '../src/components/MapStyleSettings.jsx';
import { ToastProvider } from '../src/hooks/useToast.jsx';
import { DEFAULT_MAP_STYLE, PRESETS, showMapStyle } from '../src/mapStyle.js';

const api = vi.hoisted(() => ({
  saveMapStyle: vi.fn(async (style) => ({ style })),
}));
vi.mock('../src/api/client.js', () => ({ api }));

beforeEach(() => {
  api.saveMapStyle.mockClear();
  act(() => showMapStyle(DEFAULT_MAP_STYLE));
});

async function openCard() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <MapStyleSettings />
    </ToastProvider>,
  );
  await user.click(screen.getByText('Customisation'));
  return user;
}
const themeName = () => screen.getByTestId('map-theme-name');

describe('BR48 Customisation', () => {
  it('BR48 is called Customisation and opens with "Tap to expand"', () => {
    render(
      <ToastProvider>
        <MapStyleSettings />
      </ToastProvider>,
    );
    expect(screen.getByText('Customisation')).toBeInTheDocument();
    expect(screen.getByText('Tap to expand')).toBeInTheDocument();
  });

  it('BR48 the map theme carousel goes round in a circle with the arrows, the title above the preview', async () => {
    const user = await openCard();
    const carousel = screen.getByRole('group', { name: 'Map theme' });
    expect(screen.getByRole('heading', { name: 'Map theme' })).toBeInTheDocument();
    expect(within(carousel).getByRole('img', { name: 'Preview of your map style' })).toBeVisible();
    expect(themeName()).toHaveTextContent(/^Classic$/);

    const next = screen.getByRole('button', { name: 'Next map theme' });
    for (const name of ['Ocean', 'Forest', 'Sunset', 'Mono', 'Classic']) {
      await user.click(next);
      expect(themeName()).toHaveTextContent(name);
    }
    await user.click(screen.getByRole('button', { name: 'Previous map theme' }));
    expect(themeName()).toHaveTextContent('Mono');
    const preview = within(carousel).getByRole('img', { name: 'Preview of your map style' });
    expect(preview.style.getPropertyValue('--pin-open')).toBe(PRESETS.mono.pins.open);
  });

  it('BR48 a theme with a colour changed one by one is shown as Custom; the arrows go on to the next theme', async () => {
    const user = await openCard();
    await user.click(screen.getByRole('button', { name: 'Next map theme' }));
    expect(themeName()).toHaveTextContent('Ocean');
    await user.dblClick(screen.getByRole('button', { name: 'Walking route' }));
    const field = within(screen.getByRole('dialog')).getByRole('textbox');
    await user.clear(field);
    await user.type(field, '#123456');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(themeName()).toHaveTextContent('Custom');
    await user.click(screen.getByRole('button', { name: 'Next map theme' }));
    expect(themeName()).toHaveTextContent('Forest');
  });

  it('BR48 the single colours come in groups: checkpoints, your position, sonar and map', async () => {
    await openCard();
    const group = (name) => screen.getByRole('group', { name });
    expect(within(group('Checkpoints')).getAllByRole('button')).toHaveLength(4);
    expect(within(group('Your position')).getAllByRole('button')).toHaveLength(2);
    expect(within(group('Sonar')).getAllByRole('button')).toHaveLength(1);
    expect(within(group('Map')).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Double-tap to edit specific colours for selected elements.',
    );
    // The colour editor is not on the card itself.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('BR48 one click selects an element, a double-click opens its colour editor, and the X closes it', async () => {
    const user = await openCard();
    const open = screen.getByRole('button', { name: 'Open checkpoints' });
    await user.click(open);
    expect(open).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.dblClick(open);
    const dialog = screen.getByRole('dialog', { name: 'Open checkpoints' });
    expect(within(dialog).getByRole('textbox')).toHaveValue(DEFAULT_MAP_STYLE.pins.open);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('BR48 two taps on a phone count as a double-click, and Enter opens the editor from the keyboard', async () => {
    const user = await openCard();
    const route = screen.getByRole('button', { name: 'Walking route' });
    await user.click(route);
    await user.click(route);
    expect(screen.getByRole('dialog', { name: 'Walking route' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    screen.getByRole('button', { name: 'Map tint' }).focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Map tint' });
    expect(within(dialog).getByLabelText(/Tint strength/)).toBeInTheDocument();
  });

  it('BR48 each popup shows a close-up of exactly the element being edited', async () => {
    const user = await openCard();
    const closeUps = {
      'Open checkpoints': '.pin.pin--open:not(.is-selected)',
      'Cleared checkpoints': '.pin.pin--done',
      'Locked checkpoints': '.pin.pin--closed',
      'Highlight (selected checkpoint)': '.pin.is-selected',
      'Your position: ball': '.puck',
      'Your position: direction indicator': '.puck-ground__beam',
      'Sonar range ring': '.puck-sonar__edge',
      'Walking route': '.mapstyle__route-line',
      'Buildings (3D map)': '.mapstyle__focus-building',
      'Map tint': '.mapstyle__streets',
    };
    for (const [name, selector] of Object.entries(closeUps)) {
      await user.dblClick(screen.getByRole('button', { name }));
      const preview = within(screen.getByRole('dialog', { name })).getByRole('img', {
        name: 'Preview of your map style',
      });
      // The same close-up frame in every popup, so every popup has the same size.
      expect(preview, name).toHaveClass('mapstyle__focus');
      expect(preview.querySelector(selector), name).not.toBeNull();
      await user.keyboard('{Escape}');
    }
  });

  it('BR48 saving sends the colours, and reset puts the default colours back', async () => {
    const user = await openCard();
    await user.click(screen.getByRole('button', { name: 'Next map theme' }));
    await user.click(screen.getByRole('button', { name: 'Save customisation' }));
    expect(api.saveMapStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'ocean', route: PRESETS.ocean.route }),
    );
    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(api.saveMapStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'classic', route: DEFAULT_MAP_STYLE.route }),
    );
    expect(themeName()).toHaveTextContent('Classic');
  });

  it('BR48 confirms before closing customisation with unsaved changes', async () => {
    const user = await openCard();
    await user.click(screen.getByRole('button', { name: 'Next map theme' }));

    const details = screen.getByTestId('map-style');
    await user.click(screen.getByText('Customisation'));
    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and leave' })).toHaveClass('btn--ok');
    expect(screen.getByRole('button', { name: 'Leave without saving' })).toHaveClass('btn--danger');
    expect(details).toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(details).toHaveAttribute('open');

    await user.click(screen.getByText('Customisation'));
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(api.saveMapStyle).toHaveBeenCalled();
    expect(details).not.toHaveAttribute('open');
  });

  it('BR48 confirms before the page close button leaves unsaved customisation', async () => {
    const user = await openCard();
    await user.click(screen.getByRole('button', { name: 'Next map theme' }));

    const event = new CustomEvent('campusgo:before-page-close', {
      cancelable: true,
      detail: { confirm: vi.fn() },
    });
    await act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    expect(api.saveMapStyle).toHaveBeenCalled();
    expect(event.detail.confirm).toHaveBeenCalled();
  });
});
