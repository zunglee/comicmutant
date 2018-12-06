<?php

namespace Zunglee\ComicBundle\Model;

/**
 * Description of ComicSuperheroBaseModel
 */
abstract class AbstractBaseModel
{
    abstract public function getConverterMap();

    public function giveArrayNotation($ignoreAttributes) {
        return ConverterUtil::convertObjecttoArray($this, $ignoreAttributes);
    }

    public function fillMe(array $attributeArray = array()) {
        foreach ($attributeArray as $attribute => $value) {

            if (method_exists($this, 'set' . ucfirst($attribute))) {
                $this->{'set' . ucfirst($attribute)}($value);
            } else if (property_exists($this, $attribute)) {
                $this->$attribute = $value;
            }
        }
    }

    protected function getArrayForCommaStr($str) {
        $trimStr = trim($str, " ,");
        if (strlen($trimStr) <= 0) {
            return array();
        }
        return explode(",", $trimStr);
    }

}
