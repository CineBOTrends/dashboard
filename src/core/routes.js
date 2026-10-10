import { mount } from "../components/chrome.js";
import { fetchError } from "../components/states.js";
import { parts, setRenderer } from "./router.js";

/* Route table of lazy imports: each feature is its own chunk and is only
   downloaded when its route is opened. */
export const ROUTES = {
  "": () => import("../features/home/home.js").then((m) => m.home),
  home: () => import("../features/home/home.js").then((m) => m.home),
  movies: () => import("../features/movies/allMovies.js").then((m) => m.movies),
  movie: () => import("../features/movie/index.js").then((m) => m.movie),
  multiplex: () =>
    import("../features/movie/multiplex.js").then((m) => m.multiplex),
  global: () => import("../features/global/global.js").then((m) => m.global),
  news: () => import("../features/editorial/editorial.js").then((m) => m.news),
  reviews: () =>
    import("../features/editorial/editorial.js").then((m) => m.reviews),
  boxoffice: () =>
    import("../features/editorial/editorial.js").then((m) => m.boxoffice),
  about: () => import("../features/static/about.js").then((m) => m.about),
  contact: () => import("../features/static/contact.js").then((m) => m.contact),
};

const notFound = () =>
  import("../features/static/notFound.js").then((m) => m.notFound);

let token = 0;
export async function render() {
  const p = parts();
  const mine = ++token;
  try {
    const load = Object.hasOwn(ROUTES, p[0] || "") ? ROUTES[p[0] || ""] : notFound;
    const screen = await load();
    if (mine !== token) return; // a newer navigation superseded this one
    return await screen(p);
  } catch (e) {
    console.error(e);
    if (mine === token) mount(fetchError(e));
  }
}

setRenderer(render);
