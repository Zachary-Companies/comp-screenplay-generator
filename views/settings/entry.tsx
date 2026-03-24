import { SettingsView } from './SettingsView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'settings', component: SettingsView });
