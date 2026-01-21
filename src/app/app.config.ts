import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, importProvidersFrom, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { AuthService } from './services/auth.service';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes), 
    provideClientHydration(withEventReplay()),
    importProvidersFrom(FormsModule),
    provideHttpClient(withFetch()),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.initFromStorage(),
      deps: [AuthService],
      multi: true
    }
  ]
};
