// Expected outbound links for a few projects, written out BY HAND (issue #92)
// so the e2e suite checks the page's link derivation instead of repeating it.
// One of each shape: the portfolio (own domain), a project with an external
// live site, and a source-only project whose demoLink is just its repo.
export function projectsLinksFixture() {
  return [
    {
      id: 1,
      name: 'theabdullahfolio',
      demo: 'https://ma.codes',
      source: 'https://github.com/MA1002643/theabdullahfolio',
    },
    {
      id: 4,
      name: 'muhammadabdullah-portfolio',
      demo: 'https://muhammadabdullah227.co.uk/',
      source: 'https://github.com/MA1002643/muhammadabdullah-portfolio',
    },
    { id: 2, name: 'AfaaqX', demo: null, source: 'https://github.com/MA1002643/AfaaqX' },
  ];
}
