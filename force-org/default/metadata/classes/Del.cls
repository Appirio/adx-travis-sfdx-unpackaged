public with sharing class Del {
  public integer a;
  public integer b;
  public integer c;
  public static integer add(integer a, integer b)
  {
    system.debug('hi');
      return a+b;
  }
  public static integer sub(integer a, integer b)
  {
     return a-b;
  }
  public static integer mul(integer a, integer b)
  {
     return a*b;
  }
}

