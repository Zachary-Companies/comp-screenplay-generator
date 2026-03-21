import { ScreenplayView } from './ScreenplayView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'screenplay', component: ScreenplayView });
