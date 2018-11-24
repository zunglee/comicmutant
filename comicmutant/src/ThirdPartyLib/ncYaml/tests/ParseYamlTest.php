<?php

include(dirname(__FILE__) . '/../bootstrap/unit.php');

use ncYaml\ParseYaml;

/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

/**
 * Description of ParseYamlTest
 *
 * @author rishabh
 */
class ParseYamlTest extends PHPUnit_Framework_TestCase {

    protected function setUp() {
        $this->tokenValueGetterFactoryObj = $this->getMockBuilder('ncYaml\TokenValueGetterFactory')->disableOriginalConstructor()->getMock();
        $this->parseYamlObj = new ParseYaml($this->tokenValueGetterFactoryObj);
        $this->secretTypeTokenValueGetterObj = $this->getMockBuilder('ncYaml\SecretTypeTokenValueGetter')->disableOriginalConstructor()->getMock();
    }

    /**
     * @dataProvider fileContentProvider
     */
    public function testGetReplacedFileContent($unparsedYamlContent, $expectedYamlContent) {

        $this->tokenValueGetterFactoryObj->method('getTokenValueGetterType')->with($this->isType('string'))->willReturn($this->secretTypeTokenValueGetterObj);

        $this->secretTypeTokenValueGetterObj->method('getTokenValue')->with($this->anything())->willReturn($expectedYamlContent);

        $newYamlContent = $this->parseYamlObj->getReplacedFileContent($unparsedYamlContent);

        $this->assertEquals($expectedYamlContent, $newYamlContent);
    }

    public function fileContentProvider() {
        return [
            ['nijobs: host', 'nijobs: host'],
            ['{"abc":"json"}', '{"abc":"json"}'],
            ['{secret.ng-db-username}', 'root'],
            ['{secret.ng-db-password}', 'Km7Iv80l'],
        ];
    }

}
