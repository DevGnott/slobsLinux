/**
 * Converts a scene collection that was created on another operating system
 * into a copy for Linux.
 *
 * Scene collections are bound to the OS they were created on, because the
 * capture sources differ (DirectShow, WASAPI, game capture, ...). This module
 * rewrites the data of such a collection so the Linux backend can load it:
 * capture sources are swapped for their Linux equivalent, sources that have
 * no equivalent are dropped together with their scene items, and the device
 * and window selections are reset because device ids are OS specific.
 *
 * It only works on the JSON data and does not touch application state, so the
 * original collection stays as it is.
 */

export interface IConvertedSourceInfo {
  name: string;
  from: string;
  to?: string;
}

export interface IConversionReport {
  /** Sources that were replaced by an equivalent Linux source */
  replaced: IConvertedSourceInfo[];
  /** Sources that have no Linux equivalent and were removed from all scenes */
  removed: IConvertedSourceInfo[];
  /** Filters that cannot be used on Linux and were removed */
  removedFilters: { source: string; name: string; type: string }[];
}

interface IConversionResult {
  data: string;
  report: IConversionReport;
}

type TSettings = Record<string, any>;

interface ISourceItem {
  id: string;
  name: string;
  type: string;
  settings: TSettings;
  filters?: { items: { name: string; type: string }[] };
  propertiesManager?: string;
  [key: string]: any;
}

interface ISceneNode {
  id: string;
  sceneNodeType: 'item' | 'folder';
  sourceId?: string;
  childrenIds?: string[];
  [key: string]: any;
}

interface IMapping {
  type: string;
  settings: (old: TSettings) => TSettings;
}

/** Forces 100% alpha on an integer color, like the Freetype overlay conversion does */
function opaque(color: number | undefined, fallback: number): number {
  if (typeof color !== 'number') return fallback;
  // eslint-disable-next-line no-bitwise
  return (color | 0xff000000) >>> 0;
}

/**
 * Sources that have a counterpart on Linux. The settings of the old source
 * are only kept where the meaning is the same on both systems.
 */
const SOURCE_MAPPINGS: Dictionary<IMapping> = {
  dshow_input: { type: 'v4l2_input', settings: () => ({}) },
  macos_avcapture: { type: 'v4l2_input', settings: () => ({}) },
  wasapi_input_capture: {
    type: 'pulse_input_capture',
    settings: () => ({ device_id: 'default' }),
  },
  coreaudio_input_capture: {
    type: 'pulse_input_capture',
    settings: () => ({ device_id: 'default' }),
  },
  wasapi_output_capture: {
    type: 'pulse_output_capture',
    settings: () => ({ device_id: 'default' }),
  },
  coreaudio_output_capture: {
    type: 'pulse_output_capture',
    settings: () => ({ device_id: 'default' }),
  },
  monitor_capture: {
    type: 'xshm_input_v2',
    settings: old => ({ screen: 0, show_cursor: old.capture_cursor ?? true }),
  },
  display_capture: {
    type: 'xshm_input_v2',
    settings: old => ({ screen: 0, show_cursor: old.show_cursor ?? true }),
  },
  screen_capture: {
    type: 'xshm_input_v2',
    settings: () => ({ screen: 0, show_cursor: true }),
  },
  // There is no hook based game capture on Linux. A screen capture keeps the
  // source visible, so the layout of the scene is not lost.
  game_capture: {
    type: 'xshm_input_v2',
    settings: () => ({ screen: 0, show_cursor: true }),
  },
  window_capture: {
    type: 'xcomposite_input',
    settings: old => ({ show_cursor: old.cursor ?? true }),
  },
  text_gdiplus: {
    type: 'text_ft2_source',
    settings: old => {
      const color1 = opaque(old.color, 0xffffffff);
      const color2 = old.gradient ? opaque(old.gradient_color, color1) : color1;
      return {
        text: old.text,
        font: old.font,
        custom_font: old.custom_font,
        outline: old.outline,
        color1,
        color2,
      };
    },
  },
};

/** Source types that behave the same on Linux and are kept with all settings */
const PORTABLE_TYPES = [
  'image_source',
  'color_source',
  'color_source_v2',
  'color_source_v3',
  'slideshow',
  'slideshow_v2',
  'ffmpeg_source',
  'vlc_source',
  'text_ft2_source',
  'text_ft2_source_v2',
  'audio_line',
];

/** Filters that depend on Windows only plugins */
function isUnsupportedFilter(type: string) {
  return type === 'vst_filter' || type === 'face_mask_filter' || type.startsWith('streamfx');
}

/**
 * @param raw The JSON of the scene collection file
 * @param availableTypes The input types that the OBS backend offers. A source
 * is only converted to or kept as a type that is part of this list.
 */
export function convertCollectionToLinux(
  raw: string,
  availableTypes: string[],
): IConversionResult {
  const root = JSON.parse(raw);
  const report: IConversionReport = { replaced: [], removed: [], removedFilters: [] };
  const available = new Set(availableTypes);

  const sourceItems: ISourceItem[] = root.sources?.items ?? [];
  const keptSources: ISourceItem[] = [];

  sourceItems.forEach(source => {
    const mapping = SOURCE_MAPPINGS[source.type];
    let targetType = source.type;
    let settings = source.settings;

    if (mapping) {
      targetType = mapping.type;
      settings = mapping.settings(source.settings ?? {});
    } else if (!PORTABLE_TYPES.includes(source.type)) {
      targetType = '';
    }

    if (!targetType || !available.has(targetType)) {
      report.removed.push({ name: source.name, from: source.type });
      return;
    }

    if (targetType !== source.type) {
      report.replaced.push({ name: source.name, from: source.type, to: targetType });
    }

    const filters = (source.filters?.items ?? []).filter(filter => {
      if (!isUnsupportedFilter(filter.type)) return true;
      report.removedFilters.push({ source: source.name, name: filter.name, type: filter.type });
      return false;
    });

    keptSources.push({
      ...source,
      type: targetType,
      settings,
      filters: { ...source.filters, items: filters },
    });
  });

  if (root.sources) root.sources.items = keptSources;

  // Remove scene items of removed sources. Scenes can contain other scenes,
  // so a scene id is a valid source id as well.
  const sceneIds = new Set<string>((root.scenes?.items ?? []).map((scene: { id: string }) => scene.id));
  const validSourceIds = new Set<string>([...keptSources.map(source => source.id), ...sceneIds]);

  (root.scenes?.items ?? []).forEach((scene: { sceneItems?: { items: ISceneNode[] } }) => {
    if (!scene.sceneItems) return;

    const items = scene.sceneItems.items.filter(
      item => item.sceneNodeType === 'folder' || validSourceIds.has(item.sourceId as string),
    );
    const itemIds = new Set(items.map(item => item.id));

    items.forEach(item => {
      if (item.sceneNodeType === 'folder' && item.childrenIds) {
        item.childrenIds = item.childrenIds.filter(id => itemIds.has(id));
      }
    });

    scene.sceneItems.items = items;
  });

  // Collab Cam is not available on Linux
  delete root.guestCam;
  root.operatingSystem = 'linux';

  return { data: JSON.stringify(root, null, 2), report };
}
