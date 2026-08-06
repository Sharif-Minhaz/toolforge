/**
 * The document a new server starts from when nobody supplies one.
 *
 * Deliberately `json-server`'s own README fixture, character for character. A
 * reader who has followed that README arrives already knowing what
 * `GET /posts/1` will return, and every example in this tool's article can be
 * pasted against a fresh server without editing. Inventing a prettier sample
 * would cost exactly that.
 *
 * It is also the smallest document that demonstrates all three resource kinds
 * the router distinguishes: two collections, a relation between them, and a
 * singular object.
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
