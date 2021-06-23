@istest
public class DelTest12
{
static testmethod void testadd()
{
        integer res=Del.add(6, 5);
        system.assertEquals(res, 11, 'add failed');
        //system.assertEquals(80,res, 'addition failed');
}
//test method
 static testmethod void testsub()
 {
         integer res=Del.sub(6, 5);
         system.assertEquals(res, 1, 'add failed');
         //system.assertEquals(80,res, 'addition failed');
 }
 // TEST DATA
 static testmethod void testmul()
 {
         integer res=Del.mul(6, 5);
         system.assertEquals(res, 30, 'add failed');
         //system.assertEquals(80,res, 'addition failed');
 }
}
