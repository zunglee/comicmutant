<?php
namespace ncYaml;

class ParseYaml {

    const YAML_PREFIX = "yamlPrefix";

    private $tokenValueGetterFactoryObj;

    public function __construct($tokenValueGetterFactoryObj) {

        $this->tokenValueGetterFactoryObj = $tokenValueGetterFactoryObj;
    }

    public function getFilePath($filepath) {
        return $this->getYamlFilePath($filepath);
    }

    public function replaceTokenValues($unparsedYamlContent, $tokenValuesArray) {
        $modifiedYamlContent = $unparsedYamlContent;
	$modifiedYamlContent = str_replace(array_keys($tokenValuesArray), $tokenValuesArray, $modifiedYamlContent);
        return $modifiedYamlContent;
    }

    private function getYamlFilePath($filepath) {
        $unparsedYamlContent = file_get_contents($filepath);
        $newContent = $this->getReplacedFileContent($unparsedYamlContent);
	$tempFilePath = tempnam(sys_get_temp_dir(), self::YAML_PREFIX);
        file_put_contents($tempFilePath, $newContent);
        return $tempFilePath;
    }

    private function isParsingRequired(array $uniqueTokens) {
        foreach ($uniqueTokens as $uniqueToken) {
	    list($tokenType, $tokenKey) = explode('.', $uniqueToken);
            if (!in_array($tokenType, [TokenValueGetterFactory::SECRET_TYPE_TOKEN, TokenValueGetterFactory::ENV_TYPE_TOKEN ]) 
			|| explode('.', $uniqueToken)[1] == NULL) {
                return false;
            }
        }
        return true;
    }

    public function getReplacedFileContent($unparsedYamlContent) {

        $tokensArray = [];
        preg_match_all('/{(.*)}/i', $unparsedYamlContent, $tokensArray);
        $uniqueTokensArray = array_unique($tokensArray[1]);
        if (count($uniqueTokensArray) <= 0 || !$this->isParsingRequired($uniqueTokensArray)) {
            return $unparsedYamlContent;
        }

        $newContent = $this->getNewContent($unparsedYamlContent, $uniqueTokensArray);
        return $newContent;
    }

    private function getNewContent($unparsedYamlContent, array $uniqueTokens) {

        $tokenValuesArray = $this->getTokenValues($uniqueTokens);
        if (count($tokenValuesArray) <= 0) {
            return $unparsedYamlContent;
        }
        $modifiedYamlContent = $this->replaceTokenValues($unparsedYamlContent, $tokenValuesArray);

        return $modifiedYamlContent;
    }

    private function getTokenValues(array $uniqueTokens) {
        $valuesArray = array();

        foreach ($uniqueTokens as $uniqueToken) {
            $tokenValue = $this->getValue($uniqueToken);
            $valuesArray["{".$uniqueToken."}"] = $tokenValue;
        }
        return $valuesArray;
    }

    private function getValue($uniqueTokens) {
        list($tokenType, $tokenKey) = explode('.', $uniqueTokens);
        $tokenValueGetterObj = $this->tokenValueGetterFactoryObj->getTokenValueGetterType($tokenType);
        return $tokenValueGetterObj->getTokenValue($tokenKey);
    }

}
