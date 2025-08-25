import { type Request, type Response } from 'express';
import { type WebRequestHandlerConstructor } from '.';
import {
  type BrowseSettings,
  type BrowseTheme
} from '../../../web/types/Settings';
import { getPackageInfo } from '../../utils/PackageInfo';

const BROWSE_SETTINGS_ENV_KEY = 'browse_settings';

const THEMES: BrowseTheme[] = [
  {
    name: 'Default',
    value: 'default',
    stylesheets: ['/themes/bootstrap/default/css/bootstrap.min.css']
  },
  ...[
    'brite',
    'cerulean',
    'cosmo',
    'cyborg',
    'darkly',
    'flatly',
    'journal',
    'litera',
    'lumen',
    'lux',
    'materia',
    'minty',
    'morph',
    'pulse',
    'quartz',
    'sandstone',
    'simplex',
    'sketchy',
    'slate',
    'solar',
    'spacelab',
    'superhero',
    'united',
    'vapor',
    'yeti',
    'zephyr'
  ].map((bootswatchThemeName) => ({
    name:
      bootswatchThemeName.charAt(0).toUpperCase() +
      bootswatchThemeName.slice(1),
    value: bootswatchThemeName,
    stylesheets: [`/themes/bootswatch/${bootswatchThemeName}/bootstrap.min.css`]
  }))
];

const DEFAULT_BROWSE_SETTINGS: BrowseSettings = {
  theme: THEMES[0].value,
  listItemsPerPage: 20,
  galleryItemsPerPage: 120
};

export function SettingsWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class SettingsWebRequestHandler extends Base {
    handleGetBrowseSettingsRequest(_req: Request, res: Response) {
      const settings = this.db.getEnvValue<BrowseSettings>(
        BROWSE_SETTINGS_ENV_KEY
      );
      if (settings) {
        res.json({
          ...DEFAULT_BROWSE_SETTINGS,
          ...settings
        });
        return;
      }
      res.json(DEFAULT_BROWSE_SETTINGS);
    }

    handleBrowseSettingOptionsRequest(_req: Request, res: Response) {
      const options = {
        themes: THEMES,
        listItemsPerPage: [10, 20, 30, 50],
        galleryItemsPerPage: [60, 120, 180, 240, 300]
      };
      res.json(options);
    }

    handleSaveBrowseSettingsRequest(req: Request, res: Response) {
      try {
        this.db.saveEnvValue(
          BROWSE_SETTINGS_ENV_KEY,
          this.#retrieveBrowseSettings(req)
        );
      } catch (error) {
        res
          .status(500)
          .send(
            `Error saving settings: ${error instanceof Error ? error.message : String(error)}`
          );
      }
      res.sendStatus(200);
    }

    #retrieveBrowseSettings(req: Request) {
      const body = req.body;
      if (this.#isBrowseSettings(body)) {
        return body;
      }
      throw Error('Invalid browse settings data');
    }

    #isBrowseSettings(data: any): data is BrowseSettings {
      if (typeof data !== 'object' || !data) {
        return false;
      }
      const hasValidThemeValue =
        Reflect.has(data, 'theme') && typeof data.theme === 'string';
      const hasValidListItemsPerPageValue =
        Reflect.has(data, 'listItemsPerPage') &&
        typeof data.listItemsPerPage === 'number';
      const hasValidGalleryItemsPerPageValue =
        Reflect.has(data, 'galleryItemsPerPage') &&
        typeof data.galleryItemsPerPage === 'number';
      return (
        hasValidThemeValue &&
        hasValidListItemsPerPageValue &&
        hasValidGalleryItemsPerPageValue
      );
    }

    handleAboutRequest(_req: Request, res: Response) {
      res.json(getPackageInfo());
    }
  };
}
