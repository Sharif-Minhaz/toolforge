/**
 * The document a new server starts from when nobody supplies one.
 *
 * `json-server`'s own README fixture, character for character — the same one the
 * JSON Server Studio starts from, and identical on purpose. A reader who has
 * used either studio arrives already knowing what is in it, and the same file
 * can be pasted into both to see one dataset served two ways, which is the
 * comparison this tool most wants somebody to be able to make.
 *
 * It is also the smallest document that exercises everything the schema
 * derivation does: two collections, so there are two types; a `postId` on
 * `comments`, so both directions of a relation are published; and a lone
 * `profile` object, so the singular case has a worked example.
 */
export const SAMPLE_DOCUMENT = `{
  "posts": [
    { "id": "1", "title": "a title", "views": 100 },
    { "id": "2", "title": "another title", "views": 200 }
  ],
  "comments": [
    { "id": "1", "text": "a comment about post 1", "postId": "1" },
    { "id": "2", "text": "another comment about post 1", "postId": "1" }
  ],
  "profile": {
    "name": "typicode"
  }
}`;
