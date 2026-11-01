/**
 * Access to the native font helpers (`font-manager` and `node-fontinfo`).
 *
 * Streamlabs only ships these native addons for Windows and macOS. On Linux
 * we implement the small part of their API we use on top of the fontconfig
 * command line tools (`fc-list` / `fc-scan`), which are present on every
 * desktop distribution.
 */
import { execFile, execFileSync } from 'child_process';
import { getOS, OS } from 'util/operating-systems';

export interface IFontDescriptor {
  path: string;
  postscriptName: string;
  family: string;
  style: string;
  weight: number;
  width: number;
  italic: boolean;
  oblique: boolean;
  monospace: boolean;
}

export interface IFontInfo {
  family_name: string;
  style_name: string;
  italic: boolean;
  bold: boolean;
}

interface IFontManager {
  getAvailableFonts(cb: (fonts: IFontDescriptor[]) => void): void;
}

interface INodeFontInfo {
  getFontInfo(path: string): IFontInfo | null;
}

// fontconfig constants (see fontconfig.h)
const FC_WEIGHT_BOLD = 200;
const FC_SLANT_ITALIC = 100;
const FC_SLANT_OBLIQUE = 110;
const FC_MONO = 100;

// Maps fontconfig weights to CSS / OpenType weights
const FC_TO_CSS_WEIGHT: [number, number][] = [
  [0, 100],
  [40, 200],
  [50, 300],
  [75, 350],
  [80, 400],
  [100, 500],
  [180, 600],
  [200, 700],
  [205, 800],
  [210, 900],
];

function fcWeightToCss(fcWeight: number) {
  let css = 400;
  FC_TO_CSS_WEIGHT.forEach(([fc, value]) => {
    if (fcWeight >= fc) css = value;
  });
  return css;
}

// fontconfig widths are percentages (100 = normal), font-manager uses 1-9 (5 = normal)
function fcWidthToFontManager(fcWidth: number) {
  const widths = [50, 63, 75, 87, 100, 113, 125, 150, 200];
  let index = widths.findIndex(w => fcWidth <= w);
  if (index === -1) index = widths.length - 1;
  return index + 1;
}

function firstValue(value: string) {
  // fontconfig may return multiple comma separated values
  return (value || '').split(',')[0].trim();
}

const LIST_FORMAT =
  '%{file}\\t%{postscriptname}\\t%{family}\\t%{style}\\t%{weight}\\t%{width}\\t%{slant}\\t%{spacing}\\n';

export function parseFcList(output: string): IFontDescriptor[] {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [path, postscriptName, family, style, weight, width, slant, spacing] = line.split('\t');
      const fcSlant = Number(slant) || 0;

      return {
        path,
        postscriptName,
        family: firstValue(family),
        style: firstValue(style),
        weight: fcWeightToCss(Number(weight) || 80),
        width: fcWidthToFontManager(Number(width) || 100),
        italic: fcSlant === FC_SLANT_ITALIC,
        oblique: fcSlant === FC_SLANT_OBLIQUE,
        monospace: Number(spacing) === FC_MONO,
      };
    })
    .filter(font => font.path && font.family);
}

const linuxFontManager: IFontManager = {
  getAvailableFonts(cb) {
    execFile('fc-list', ['--format', LIST_FORMAT], { maxBuffer: 64 * 1024 * 1024 }, (e, out) => {
      if (e) {
        console.error('Unable to list system fonts with fc-list', e);
        cb([]);
        return;
      }
      cb(parseFcList(out));
    });
  },
};

const linuxFontInfo: INodeFontInfo = {
  getFontInfo(path) {
    try {
      const out = execFileSync(
        'fc-scan',
        ['--format', '%{family}\\t%{style}\\t%{weight}\\t%{slant}\\n', path],
        { encoding: 'utf8' },
      );
      const [family, style, weight, slant] = out.split('\n')[0].split('\t');
      if (!family) return null;

      return {
        family_name: firstValue(family),
        style_name: firstValue(style),
        bold: Number(weight) >= FC_WEIGHT_BOLD,
        italic: Number(slant) >= FC_SLANT_ITALIC,
      };
    } catch (e: unknown) {
      console.error(`Unable to read font info for ${path}`, e);
      return null;
    }
  },
};

function nativeRequire<T>(name: string): T {
  return (window as any)['require'](name);
}

export const fontManager: IFontManager =
  getOS() === OS.Linux ? linuxFontManager : nativeRequire<IFontManager>('font-manager');

export const fontInfo: INodeFontInfo =
  getOS() === OS.Linux ? linuxFontInfo : nativeRequire<INodeFontInfo>('node-fontinfo');
