import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { installCsrfFetchInterceptor } from "./lib/csrf";
import { applyCachedTheme } from "./lib/theme-apply";

// Install the global fetch shim that attaches the X-XSRF-TOKEN
// header to mutating, same-origin /api/* requests so the server's
// `requireCsrfTokenMiddleware` accepts them. Must run BEFORE any
// component mounts (which means before the first apiRequest call).
installCsrfFetchInterceptor();

// Paint the last active brand theme before the first render, so the header
// and sidebar don't flash the default colors while /api/themes/active loads.
applyCachedTheme();

createRoot(document.getElementById("root")!).render(<App />);