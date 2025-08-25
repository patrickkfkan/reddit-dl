import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer
} from 'react';
import * as _ from 'lodash-es';
import {
  type BrowseSettingOptions,
  type BrowseSettings
} from '../types/Settings';

interface SettingsProviderProps {
  children: React.ReactNode;
}

interface SettingsContextValue {
  settings: BrowseSettings;
  options: BrowseSettingOptions;
  refreshSettings: () => void;
  updateSettings: (values: BrowseSettingValues) => void;
}

const BrowseSettingsContext = createContext({} as SettingsContextValue);

export type BrowseSettingValues = {
  [T in keyof BrowseSettings]?: BrowseSettings[T];
};

const settingsReducer = (
  currentSettings: BrowseSettings | null,
  settings: BrowseSettings
) => {
  return _.isEqual(settings, currentSettings) ? currentSettings : settings;
};

const optionsReducer = (
  currentOptions: BrowseSettingOptions | null,
  options: BrowseSettingOptions
) => {
  return _.isEqual(options, currentOptions) ? currentOptions : options;
};

function BrowseSettingsProvider(props: SettingsProviderProps) {
  const [settings, setSettings] = useReducer(settingsReducer, null);
  const [options, setOptions] = useReducer(optionsReducer, null);

  const saveSettings = useCallback(async (settings: BrowseSettings) => {
    return fetch('/api/settings/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  }, []);

  const getSettings = useCallback(async (): Promise<BrowseSettings> => {
    const urlObj = new URL(`/api/settings/browse`, window.location.href);
    const result = await fetch(urlObj.toString());
    return await result.json();
  }, []);

  const getOptions = useCallback(async (): Promise<BrowseSettingOptions> => {
    const urlObj = new URL(
      `/api/settings/browse/options`,
      window.location.href
    );
    const result = await fetch(urlObj.toString());
    return await result.json();
  }, []);

  const updateSettings = useCallback(
    (values: BrowseSettingValues) => {
      if (!settings) {
        return null;
      }
      const newSettings = _.cloneDeep(settings);
      if (values.theme) {
        newSettings.theme = values.theme;
      }
      if (values.listItemsPerPage) {
        newSettings.listItemsPerPage = values.listItemsPerPage;
      }
      if (values.galleryItemsPerPage) {
        newSettings.galleryItemsPerPage = values.galleryItemsPerPage;
      }
      void (async () => {
        if (!_.isEqual(settings, newSettings)) {
          await saveSettings(newSettings);
          setSettings(newSettings);
        }
      })();
    },
    [settings]
  );

  const refreshSettings = useCallback(() => {
    void (async () => {
      setSettings(await getSettings());
      setOptions(await getOptions());
    })();
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  if (!settings || !options) {
    return;
  }

  return (
    <BrowseSettingsContext.Provider
      value={{ settings, options, updateSettings, refreshSettings }}
    >
      {props.children}
    </BrowseSettingsContext.Provider>
  );
}

const useBrowseSettings = () => useContext(BrowseSettingsContext);

export { useBrowseSettings, BrowseSettingsProvider };
