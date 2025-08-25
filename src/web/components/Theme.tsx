import { useEffect, useReducer, useState } from 'react';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

interface ThemeProps {
  onInit: () => void;
}

const stylesheetsReducer = (
  currentStylesheets: string[] | null,
  stylesheets: string[] | null
) => {
  if (currentStylesheets && stylesheets) {
    const isEqual =
      JSON.stringify(currentStylesheets.sort()) ===
      JSON.stringify(stylesheets.sort());
    return isEqual ? currentStylesheets : stylesheets;
  }
  return stylesheets;
};

function Theme({ onInit }: ThemeProps) {
  const { settings, options } = useBrowseSettings();
  const [stylesheets, setStylesheets] = useReducer(stylesheetsReducer, null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const stylesheets =
      options.themes.find((theme) => theme.value === settings.theme)
        ?.stylesheets || null;
    setStylesheets(stylesheets);
  }, [settings, options]);

  useEffect(() => {
    if (initialized) {
      onInit();
    }
  }, [initialized, onInit]);

  useEffect(() => {
    if (!stylesheets || stylesheets.length === 0) {
      return;
    }
    /*const oldLinks = document.querySelectorAll('link[id^="theme-stylesheet-"]');
    oldLinks.forEach((link) => link.remove());*/

    const preloadLinks = stylesheets.map((sheet) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = sheet;
      return link;
    });

    let preloadedCount = 0;

    const checkPreloads = () => {
      if (preloadedCount === preloadLinks.length) {
        const oldLinks = document.querySelectorAll(
          'link[id^="theme-stylesheet-"]'
        );
        preloadLinks.forEach((link, i) => {
          link.id = `theme-stylesheet-${i}`;
          link.rel = 'stylesheet';
        });
        oldLinks.forEach((link) => link.remove());
        setInitialized(true);
      }
    };

    preloadLinks.forEach((link) => {
      link.onload = () => {
        preloadedCount++;
        checkPreloads();
      };
      document.head.prepend(link);
    });
    /*const link = document.createElement("link");
      link.id = `theme-stylesheet-${i}`;
      link.rel = "stylesheet";
      link.href = sheet;
      document.head.prepend(link);
    })*/
  }, [stylesheets]);

  return null;
}

export default Theme;
