import {
  OPENAPI_WELL_KNOWN_PATHS,
  openApiCandidateUrls,
  originsOf,
  parseServiceDescLink,
} from './candidates';

describe('originsOf', () => {
  it('returns each https origin once, in manifest order', () => {
    expect(
      originsOf([
        'https://a.example/v1/x',
        'https://b.example/y',
        'https://a.example/v1/z?q=1',
      ])
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('lowercases the host so spellings of one origin collapse', () => {
    expect(originsOf(['https://A.Example/x', 'https://a.example/y'])).toEqual([
      'https://a.example',
    ]);
  });

  it.each([
    ['plain http', 'http://a.example/x'],
    ['a non-default port', 'https://a.example:8443/x'],
    ['userinfo', 'https://user:pw@a.example/x'],
    ['not a url', 'nope'],
  ])('skips %s', (_name, resource) => {
    expect(originsOf([resource, 'https://ok.example/x'])).toEqual([
      'https://ok.example',
    ]);
  });

  it('stops at the limit', () => {
    expect(
      originsOf(
        ['https://a.example/', 'https://b.example/', 'https://c.example/'],
        2
      )
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('parseServiceDescLink', () => {
  const origin = 'https://a.example';

  it('resolves a relative service-desc target against the origin', () => {
    expect(
      parseServiceDescLink('</api/openapi.json>; rel="service-desc"', origin)
    ).toBe('https://a.example/api/openapi.json');
  });

  it('finds service-desc among several links', () => {
    const header =
      '<https://a.example/docs>; rel="service-doc", ' +
      '<https://a.example/spec.yaml>; rel="service-desc"; type="application/yaml"';
    expect(parseServiceDescLink(header, origin)).toBe(
      'https://a.example/spec.yaml'
    );
  });

  it('accepts an unquoted rel', () => {
    expect(parseServiceDescLink('</spec.json>; rel=service-desc', origin)).toBe(
      'https://a.example/spec.json'
    );
  });

  it('refuses a target on another origin', () => {
    expect(
      parseServiceDescLink(
        '<https://evil.example/spec.json>; rel="service-desc"',
        origin
      )
    ).toBeNull();
  });

  it('returns null without a service-desc link', () => {
    expect(
      parseServiceDescLink('</docs>; rel="service-doc"', origin)
    ).toBeNull();
    expect(parseServiceDescLink(undefined, origin)).toBeNull();
    expect(parseServiceDescLink('', origin)).toBeNull();
  });
});

describe('openApiCandidateUrls', () => {
  it('lists the advertised document first, then the well-known paths', () => {
    const urls = openApiCandidateUrls(
      'https://a.example',
      'https://a.example/custom.json'
    );

    expect(urls[0]).toBe('https://a.example/custom.json');
    expect(urls.slice(1)).toEqual(
      OPENAPI_WELL_KNOWN_PATHS.map((path) => `https://a.example${path}`)
    );
  });

  it('does not repeat an advertised document that is also a well-known path', () => {
    const urls = openApiCandidateUrls(
      'https://a.example',
      'https://a.example/openapi.json'
    );

    expect(
      urls.filter((url) => url === 'https://a.example/openapi.json')
    ).toHaveLength(1);
  });

  it('is only the well-known paths without an advertised document', () => {
    expect(openApiCandidateUrls('https://a.example', null)).toHaveLength(
      OPENAPI_WELL_KNOWN_PATHS.length
    );
  });
});
