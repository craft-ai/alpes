// @flow
import test from 'ava';
import  { drain, tap, throwError } from '../src';

test('Throws the given error', (t) => {
  const errorMessage = 'ahahahaha';
  return t.throws(
    throwError(new Error(errorMessage))
      .thru(tap(() => t.fail('Unexpected event in the stream')))
      .thru(drain()),
    Error
  ).then((error) => t.is(error.message, errorMessage));
});
