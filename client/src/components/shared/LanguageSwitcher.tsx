import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
import { LOCALES } from '@/config/locales';

// onDarkBackground: the sign-in and setup screens sit on a fixed dark backdrop, so the icon stays white in both modes
// instead of following the header theme's text color.
export function LanguageSwitcher({ onDarkBackground = false }: { onDarkBackground?: boolean }) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  const currentLanguage = LOCALES.find(lang => lang.simpleCode === i18n.language) || LOCALES[0];

  const changeLanguage = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };

  return (
    <div data-theme-exempt="true">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center ${onDarkBackground ? "text-white hover:bg-white/10" : "brand-topbar-icon-btn"} transition-all duration-200 rounded-md p-2 cursor-pointer`}
            title={currentLanguage.name}
            aria-label={t('language.switchLanguage')}
            style={{
              border: 'none',
              outline: 'none'
            }}
          >
            <Globe className="h-5 w-5" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 2 }} />
          </button>
        </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[150px] border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      >
        {LOCALES.map((language) => {
          const selected = i18n.language === language.simpleCode;
          return (
            <DropdownMenuItem
              key={language.code}
              onSelect={() => changeLanguage(language.simpleCode)}
              className={`cursor-pointer px-4 py-2 text-sm flex items-center space-x-2 ${
                selected
                  ? "bg-blue-50 text-blue-600 focus:bg-blue-50 focus:text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:focus:bg-blue-900/40 dark:focus:text-blue-300"
                  : "bg-white text-gray-700 focus:bg-gray-100 focus:text-gray-900 dark:bg-gray-900 dark:text-gray-200 dark:focus:bg-gray-800 dark:focus:text-white"
              }`}
            >
              <span className="text-lg">{language.flag}</span>
              <span>{language.name}</span>
              {selected && <span className="ml-auto">✓</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}