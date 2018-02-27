// @flow
import test from 'ava';
import  { drain, tap, throwError } from '../src';

test('Throws the given error', (t) => {
  const errorMessage = 'ahahahaha';
  return t.throws(throwError(new Error(errorMessage))
    .thru(tap(() => t.fail('Unexpected event in the stream')))
    .thru(drain()),
  errorMessage);
});

test('Throws the given error properly', (t) => {
  const errorMessage = 'huhuhuhuhuh';
  t.plan(1);
  try {
    return throwError(new Error(errorMessage))
      .thru(drain())
      .catch((e) => t.is(e.message, errorMessage));
  }
  catch (e) {
    console.log(e);
  }
});
