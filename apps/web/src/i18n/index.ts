import { i18n } from '@lingui/core';
import { messages } from './locales/pl.po';

i18n.load('pl', messages);
i18n.activate('pl');

export { i18n };
